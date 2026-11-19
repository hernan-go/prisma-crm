import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { query, execute, type Connection } from './db.js';
import { sessionDigest } from './identity.js';
import { AppError } from './errors.js';
import { withPortalDatabase } from './portal-policy.js';
import { validatePortalLoginContext } from './portal-access.js';
import { mysqlPortalOidcStore } from './portal-oidc-store.js';
import type { PortalEvidenceReference } from './portal-oidc-contracts.js';
import type { PortalTransaction } from '../shared/portal.js';

export interface PortalBrowserCredentials {
  crmTokens: string[];
  legacyPresent: boolean;
  portalTokens: string[];
}
export interface PortalLogoutCredentials {
  portalTokens: string[];
  correlation?: { id: string; browserHash: string };
}
interface LifecycleSession {
  token_hash: string;
  user_id: string;
  expires_at: number;
  revoked_at: number | null;
}
const clock = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';
const deny = () => new AppError(401, 'Sesión portal no válida.');
const conflict = () =>
  new AppError(409, 'Cerrá la sesión correspondiente antes de cambiar de cuenta.');
const ttl = 8 * 60 * 60 * 1000;
async function currentCrm(db: Connection, credentials: PortalBrowserCredentials) {
  if (credentials.legacyPresent || credentials.crmTokens.length > 1) throw conflict();
  if (!credentials.crmTokens.length) return null;
  const hash = sessionDigest(credentials.crmTokens[0]);
  if (!hash) throw conflict();
  const [row] = await query<{ user_id: string }>(
    `SELECT s.user_id FROM identity_sessions s
    JOIN identity_users u ON u.id=s.user_id
    JOIN identity_user_roles r ON r.user_id=u.id AND r.role='admin'
    JOIN identity_external_accounts g ON g.user_id=u.id AND g.provider='google'
    JOIN identity_institution i ON i.id=1 AND i.initialized=1 AND (i.admin_one=u.id OR i.admin_two=u.id)
    WHERE s.token_hash=? AND s.application='crm' AND s.revoked_at IS NULL AND s.expires_at>${clock} AND u.status='enabled' FOR UPDATE`,
    [hash],
    db,
  );
  if (!row) throw conflict();
  return row.user_id;
}
async function crmScope(credentials: PortalBrowserCredentials) {
  if (
    credentials.legacyPresent ||
    credentials.crmTokens.length > 1 ||
    credentials.portalTokens.length > 1
  )
    throw conflict();
  if (!credentials.crmTokens.length) return [];
  const hash = sessionDigest(credentials.crmTokens[0]);
  if (!hash) throw conflict();
  const [row] = await query<{ user_id: string }>(
    'SELECT user_id FROM identity_sessions WHERE token_hash=?',
    [hash],
  );
  if (!row) throw conflict();
  return [row.user_id]; // hint only, revalidated with current reads under locks
}
async function eligible(
  tx: PortalTransaction,
  userId: string,
  attempt: { begin_seq: string; emergency_epoch: string },
) {
  const link = (await tx.links()).find((l) => l.user_id === userId);
  if (!link) throw new AppError(403, 'Acceso portal no habilitado.');
  validatePortalLoginContext(await tx.state(), link, attempt);
  await tx.assertEligible([{ userId, instructorId: link.instructor_id }]);
  return link.instructor_id;
}
async function requireAvailable(tx: PortalTransaction) {
  const state = await tx.state();
  if (!state.enabled || !state.pilot_sealed || state.admissions_open)
    throw new AppError(503, 'Portal no disponible.');
  if ((await tx.links()).length !== 2) throw new AppError(503, 'Portal no disponible.');
}
export function createPortalSessionService() {
  const store = mysqlPortalOidcStore();
  return {
    async logout(credentials: PortalLogoutCredentials) {
      if (credentials.portalTokens.length > 1) throw conflict();
      const presented = credentials.portalTokens[0];
      const presentedHash = presented === undefined ? undefined : sessionDigest(presented);
      if (presented !== undefined && !presentedHash) throw deny();
      if (credentials.correlation) {
        if (
          !z.string().uuid().safeParse(credentials.correlation.id).success ||
          !/^[a-f0-9]{64}$/.test(credentials.correlation.browserHash)
        )
          throw deny();
      }
      if (!presentedHash && !credentials.correlation) return;
      await withPortalDatabase(async (db) => {
        const hashes = new Set<string>(presentedHash ? [presentedHash] : []);
        const c = credentials.correlation;
        if (c) {
          const [attempt] = await query<{ status: string; issued_session_hash: string | null }>(
            "SELECT status,issued_session_hash FROM identity_portal_oidc_attempts WHERE id=? AND browser_hash=? AND application='portal' AND provider='google' FOR UPDATE",
            [c.id, c.browserHash],
            db,
          );
          if (attempt?.status === 'consumed') {
            if (!attempt.issued_session_hash)
              throw new AppError(503, 'Asociación portal no disponible.');
            hashes.add(attempt.issued_session_hash);
          } else if (attempt) {
            // No identity is available before verification: row/timestamp is evidence.
            await execute(
              `UPDATE identity_portal_oidc_attempts SET status='invalidated',invalidated_at=${clock},nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL,subject=NULL,token_issued_at=NULL,token_expires_at=NULL,authentication_time=NULL WHERE id=? AND status IN ('pending','claimed','verified')`,
              [c.id],
              db,
            );
          }
        }
        // At most two credentials. Lifecycle readers take attempt then sessions;
        // all consumers first share the exclusive institutional/policy coordinator,
        // so issuance/guards cannot hold their session lock concurrently here.
        for (const hash of [...hashes].sort()) {
          const [s] = await query<LifecycleSession>(
            "SELECT token_hash,user_id,expires_at,revoked_at FROM identity_sessions WHERE token_hash=? AND application='portal' FOR UPDATE",
            [hash],
            db,
          );
          if (!s) continue; // Unknown/previously purged credentials are idempotent no-ops.
          if (s.revoked_at !== null) continue;
          await execute(
            `UPDATE identity_sessions SET revoked_at=GREATEST(created_at,${clock}) WHERE token_hash=? AND application='portal' AND revoked_at IS NULL`,
            [s.token_hash],
            db,
          );
          await execute(
            "INSERT INTO identity_audit_events(user_id,actor_id,event) VALUES (?,?,'portal.session.revoked')",
            [s.user_id, s.user_id],
            db,
          );
        }
      });
    },
    async maintain(limit = 100) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 200)
        throw new AppError(400, 'Lote no válido.');
      return withPortalDatabase(async (db) => {
        const attempts = await query<{ id: string }>(
          `SELECT id FROM identity_portal_oidc_attempts WHERE status IN ('pending','claimed','verified') AND expires_at<=${clock} ORDER BY expires_at,id LIMIT ${limit} FOR UPDATE`,
          [],
          db,
        );
        let invalidated = 0,
          purgedAttempts = 0,
          purgedSessions = 0;
        for (const a of attempts) {
          await execute(
            `UPDATE identity_portal_oidc_attempts SET status='invalidated',invalidated_at=${clock},nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL,subject=NULL,token_issued_at=NULL,token_expires_at=NULL,authentication_time=NULL WHERE id=? AND status IN ('pending','claimed','verified')`,
            [a.id],
            db,
          );
          invalidated++;
        }
        const terminal = await query<{ id: string }>(
          `SELECT a.id FROM identity_portal_oidc_attempts a LEFT JOIN identity_sessions s ON s.token_hash=a.issued_session_hash
          WHERE a.status IN ('consumed','invalidated') AND a.expires_at<${clock}-86400000
          AND (a.invalidated_at IS NULL OR a.invalidated_at<${clock}-86400000)
          AND (a.issued_session_hash IS NULL OR (s.application='portal' AND s.expires_at<${clock}-86400000 AND (s.revoked_at IS NULL OR s.revoked_at<${clock}-86400000)))
          ORDER BY a.expires_at,a.id LIMIT ${limit} FOR UPDATE`,
          [],
          db,
        );
        for (const a of terminal) {
          await execute('DELETE FROM identity_portal_oidc_attempts WHERE id=?', [a.id], db);
          purgedAttempts++;
        }
        const sessions = await query<{ token_hash: string }>(
          `SELECT s.token_hash FROM identity_sessions s WHERE s.application='portal' AND s.expires_at<${clock}-86400000 AND (s.revoked_at IS NULL OR s.revoked_at<${clock}-86400000) AND NOT EXISTS (SELECT 1 FROM identity_portal_oidc_attempts a WHERE a.issued_session_hash=s.token_hash) ORDER BY s.expires_at,s.token_hash LIMIT ${limit} FOR UPDATE`,
          [],
          db,
        );
        for (const s of sessions) {
          const result = await execute(
            "DELETE FROM identity_sessions WHERE token_hash=? AND application='portal' AND NOT EXISTS (SELECT 1 FROM identity_portal_oidc_attempts WHERE issued_session_hash=?)",
            [s.token_hash, s.token_hash],
            db,
          );
          purgedSessions += result.affectedRows;
        }
        return {
          scanned: attempts.length + terminal.length + sessions.length,
          invalidated,
          purgedAttempts,
          purgedSessions,
        };
      });
    },
    available: () =>
      withPortalDatabase(async (_db, tx) => {
        await requireAvailable(tx);
      }),
    async expectedCrm(credentials: PortalBrowserCredentials) {
      if (credentials.portalTokens.length) throw conflict();
      const userIds = await crmScope(credentials);
      return withPortalDatabase(
        async (db, tx) => {
          await requireAvailable(tx);
          return currentCrm(db, credentials);
        },
        { userIds },
      );
    },
    async finish(ref: PortalEvidenceReference, credentials: PortalBrowserCredentials) {
      if (credentials.portalTokens.length) throw conflict();
      const userIds = await crmScope(credentials);
      return withPortalDatabase(
        async (db, tx) => {
          await requireAvailable(tx);
          const crm = await currentCrm(db, credentials);
          // all pilot identity resources were locked before any sessions/attempts
          const proof = await store.readEvidenceForFinish(db, ref);
          const links = await tx.links();
          if (!links.length) throw new AppError(403, 'Acceso portal no habilitado.');
          const [account] = await query<{ user_id: string }>(
            `SELECT user_id FROM identity_external_accounts WHERE provider='google' AND subject=? AND user_id IN (${links.map(() => '?').join(',')}) FOR UPDATE`,
            [proof.subject, ...links.map((l) => l.user_id)],
            db,
          );
          if (!account || !links.some((l) => l.user_id === account.user_id))
            throw new AppError(403, 'Acceso portal no habilitado.');
          if (
            (proof.expectedCrmUserId !== null && proof.expectedCrmUserId !== account.user_id) ||
            (crm !== null && crm !== account.user_id)
          )
            throw conflict();
          const instructorId = await eligible(tx, account.user_id, {
            begin_seq: proof.beginSeq,
            emergency_epoch: proof.emergencyEpoch,
          });
          const token = randomBytes(32).toString('hex'),
            hash = sessionDigest(token)!;
          const created = Number(
              (await query<{ now: number }>(`SELECT ${clock} AS now`, [], db))[0].now,
            ),
            expiresAt = created + ttl;
          await execute(
            "INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at) VALUES (?, ?,'portal',?,?)",
            [hash, account.user_id, created, expiresAt],
            db,
          );
          const changed = await execute(
            `UPDATE identity_portal_oidc_attempts SET status='consumed',consumed_at=${clock},issued_session_hash=?,subject=NULL,token_issued_at=NULL,token_expires_at=NULL,authentication_time=NULL WHERE id=? AND status='verified' AND expires_at>${clock} AND token_expires_at>${clock}`,
            [hash, ref.id],
            db,
          );
          if (changed.affectedRows !== 1) throw deny();
          await execute(
            "INSERT INTO identity_audit_events(user_id,actor_id,event) VALUES (?,?,'portal.session.created')",
            [account.user_id, account.user_id],
            db,
          );
          return { token, expiresAt, userId: account.user_id, instructorId };
        },
        { userIds },
      );
    },
    async authenticate(token: string, credentials: PortalBrowserCredentials) {
      const hash = sessionDigest(token);
      if (!hash || credentials.portalTokens.length !== 1 || credentials.portalTokens[0] !== token)
        throw deny();
      const userIds = await crmScope(credentials);
      return withPortalDatabase(
        async (db, tx) => {
          await requireAvailable(tx);
          const crm = await currentCrm(db, credentials);
          const [session] = await query<{ user_id: string; expires_at: number }>(
            `SELECT user_id,expires_at FROM identity_sessions WHERE token_hash=? AND application='portal' AND revoked_at IS NULL AND expires_at>${clock} FOR UPDATE`,
            [hash],
            db,
          );
          if (!session) throw deny();
          const [attempt] = await query<{
            begin_seq: string;
            emergency_epoch: string;
            expected_crm_user_id: string | null;
          }>(
            "SELECT CAST(begin_seq AS CHAR) begin_seq,CAST(emergency_epoch AS CHAR) emergency_epoch,expected_crm_user_id FROM identity_portal_oidc_attempts WHERE issued_session_hash=? AND status='consumed' AND application='portal' AND provider='google' FOR UPDATE",
            [hash],
            db,
          );
          if (!attempt) throw deny();
          if (crm !== null && crm !== session.user_id) throw conflict();
          if (
            attempt.expected_crm_user_id !== null &&
            attempt.expected_crm_user_id !== session.user_id
          )
            throw deny();
          const instructorId = await eligible(tx, session.user_id, attempt);
          return { userId: session.user_id, instructorId, expiresAt: Number(session.expires_at) };
        },
        { userIds },
      );
    },
  };
}
