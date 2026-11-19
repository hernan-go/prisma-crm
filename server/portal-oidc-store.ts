// Opt-in internal store for 021. No HTTP imports, session issuance or cleanup.
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { execute, query, transaction, type Connection } from './db.js';
import { lockInstitution } from './identity-policy.js';
import { oidcFailure } from './oidc-crypto.js';
import { portalCounter } from '../shared/portal.js';
import {
  portalOidcContextSchema,
  type PortalOidcAttempt,
  type PortalEvidenceReference,
  type PortalOidcStore,
  type PortalVerifiedEvidence,
} from './portal-oidc-contracts.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const clock = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';
const wipe = 'nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL';
const erase = 'subject=NULL,token_issued_at=NULL,token_expires_at=NULL,authentication_time=NULL';
const columns =
  '*,CAST(begin_seq AS CHAR) AS exact_begin_seq,CAST(emergency_epoch AS CHAR) AS exact_emergency_epoch';
interface Row {
  id: string;
  provider: string;
  application: string;
  configuration_hash: string;
  state_hash: string;
  browser_hash: string;
  expected_crm_user_id: string | null;
  exact_begin_seq: string;
  exact_emergency_epoch: string;
  status: string;
  expires_at: number;
  nonce: string;
  pkce_key_id: string;
  pkce_encrypted: string;
  subject: string;
  token_issued_at: number;
  token_expires_at: number;
  authentication_time: number | null;
  issued_session_hash: string | null;
}
interface Policy {
  enabled: number;
  pilot_sealed: number;
  admissions_open: number;
  security_seq: string;
  emergency_epoch: string;
}
async function now(db: Connection) {
  return Number((await query<{ now: number }>(`SELECT ${clock} AS now`, [], db))[0].now);
}
async function policy(db: Connection, requireEnabled: boolean) {
  if (!(await lockInstitution(db))?.initialized) throw oidcFailure();
  if (!(await query("SELECT name FROM schema_migrations WHERE name='021.sql'", [], db)).length)
    throw oidcFailure();
  const [p] = await query<Policy>(
    'SELECT enabled,pilot_sealed,admissions_open,CAST(security_seq AS CHAR) security_seq,CAST(emergency_epoch AS CHAR) emergency_epoch FROM portal_access_state WHERE id=1 FOR UPDATE',
    [],
    db,
  );
  if (!p || p.admissions_open || (requireEnabled && (!p.enabled || !p.pilot_sealed)))
    throw oidcFailure();
  portalCounter.parse(p.security_seq);
  portalCounter.parse(p.emergency_epoch);
  return p;
}
function reference(ref: Omit<PortalEvidenceReference, 'id'>) {
  hash.parse(ref.browserHash);
  hash.parse(ref.configurationHash);
  portalOidcContextSchema.parse(ref.context);
}
function matches(row: Row, ref: Omit<PortalEvidenceReference, 'id'>) {
  reference(ref);
  if (
    row.provider !== 'google' ||
    row.application !== 'portal' ||
    row.browser_hash !== ref.browserHash ||
    row.configuration_hash !== ref.configurationHash ||
    row.expected_crm_user_id !== ref.context.expectedCrmUserId
  )
    throw oidcFailure();
}
function globalBarrier(row: Row, p: Policy) {
  if (
    portalCounter.parse(row.exact_emergency_epoch) !== p.emergency_epoch ||
    BigInt(portalCounter.parse(row.exact_begin_seq)) > BigInt(p.security_seq)
  )
    throw oidcFailure();
}
async function locked(db: Connection, ref: PortalEvidenceReference, p: Policy) {
  uuid.parse(ref.id);
  const [row] = await query<Row>(
    `SELECT ${columns} FROM identity_portal_oidc_attempts WHERE id=? FOR UPDATE`,
    [ref.id],
    db,
  );
  if (!row) throw oidcFailure();
  matches(row, ref);
  globalBarrier(row, p);
  if (Number(row.expires_at) <= (await now(db))) throw oidcFailure();
  return row;
}
async function sanitized<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    throw oidcFailure();
  }
}

export function mysqlPortalOidcStore() {
  const store: PortalOidcStore = {
    create: (a) =>
      sanitized(async () => {
        uuid.parse(a.id);
        reference(a);
        hash.parse(a.stateHash);
        if (
          !/^[A-Za-z0-9_-]{43}$/.test(a.nonce) ||
          !/^[A-Za-z0-9_-]{1,32}$/.test(a.keyId) ||
          !/^[A-Za-z0-9_-]{95}$/.test(a.encrypted)
        )
          throw oidcFailure();
        return transaction(async (db) => {
          const p = await policy(db, true),
            time = await now(db),
            expires = time + 300000;
          await execute(
            `INSERT INTO identity_portal_oidc_attempts
          (id,provider,application,configuration_hash,state_hash,browser_hash,nonce,pkce_key_id,pkce_encrypted,begin_seq,emergency_epoch,expected_crm_user_id,status,created_at,expires_at)
          VALUES (?,'google','portal',?,?,?,?,?,?,?,?,?,'pending',?,?)`,
            [
              a.id,
              a.configurationHash,
              a.stateHash,
              a.browserHash,
              a.nonce,
              a.keyId,
              a.encrypted,
              p.security_seq,
              p.emergency_epoch,
              a.context.expectedCrmUserId,
              time,
              expires,
            ],
            db,
          );
          return expires;
        });
      }),
    claim: (stateHash, ref) =>
      sanitized(async (): Promise<PortalOidcAttempt> => {
        hash.parse(stateHash);
        reference(ref);
        return transaction(async (db) => {
          const p = await policy(db, true);
          const [row] = await query<Row>(
            `SELECT ${columns} FROM identity_portal_oidc_attempts WHERE state_hash=? FOR UPDATE`,
            [stateHash],
            db,
          );
          if (!row) throw oidcFailure();
          matches(row, ref);
          globalBarrier(row, p);
          if (row.status !== 'pending' || Number(row.expires_at) <= (await now(db)))
            throw oidcFailure();
          const result = await execute(
            `UPDATE identity_portal_oidc_attempts SET status='claimed',claimed_at=${clock},${wipe} WHERE id=? AND status='pending' AND expires_at>${clock}`,
            [row.id],
            db,
          );
          if (result.affectedRows !== 1) throw oidcFailure();
          return {
            id: row.id,
            configurationHash: row.configuration_hash,
            stateHash: row.state_hash,
            browserHash: row.browser_hash,
            nonce: row.nonce,
            keyId: row.pkce_key_id,
            encrypted: row.pkce_encrypted,
            context: portalOidcContextSchema.parse(ref.context),
          };
        }); // Commit claim and erasure before the core can contact Google.
      }),
    verify: (ref, proof) =>
      sanitized(async () => {
        z.object({
          subject: z.string().regex(/^[\x21-\x7e]{1,255}$/),
          issuedAt: z.number().int().nonnegative().safe(),
          expiresAt: z.number().int().positive().safe(),
          authenticationTime: z.number().int().nonnegative().safe().nullable(),
        })
          .strict()
          .parse(proof);
        await transaction(async (db) => {
          const p = await policy(db, true),
            row = await locked(db, ref, p),
            time = await now(db);
          const expires = Math.min(Number(row.expires_at), proof.expiresAt);
          if (
            row.status !== 'claimed' ||
            proof.issuedAt > time + 30000 ||
            proof.expiresAt <= proof.issuedAt ||
            expires <= time ||
            (proof.authenticationTime !== null &&
              (proof.authenticationTime > time + 30000 ||
                proof.authenticationTime > proof.issuedAt))
          )
            throw oidcFailure();
          const result = await execute(
            `UPDATE identity_portal_oidc_attempts SET status='verified',verified_at=${clock},expires_at=?,subject=?,token_issued_at=?,token_expires_at=?,authentication_time=? WHERE id=? AND status='claimed' AND expires_at>${clock} AND ?>${clock}`,
            [
              expires,
              proof.subject,
              proof.issuedAt,
              proof.expiresAt,
              proof.authenticationTime,
              ref.id,
              expires,
            ],
            db,
          );
          if (result.affectedRows !== 1) throw oidcFailure();
        });
      }),
    invalidate: (ref) =>
      sanitized(async () => {
        uuid.parse(ref.id);
        reference(ref);
        await transaction(async (db) => {
          await policy(db, false);
          const [row] = await query<Row>(
            `SELECT ${columns} FROM identity_portal_oidc_attempts WHERE id=? FOR UPDATE`,
            [ref.id],
            db,
          );
          if (!row) throw oidcFailure();
          matches(row, ref);
          await invalidatePending(db, ref.id);
        });
      }),
  };
  return {
    ...store,
    // Does not consume or authorize. Block 4 must hold institution -> policy ->
    // ordered resources -> sessions BEFORE calling; this must be the SAME active
    // transaction as eligibility, session insertion, consumed+association and audit.
    // In particular, validate min_login_seq/role/Google/instructor and CRM conflict.
    readEvidenceForFinish: (db: PoolConnection, ref: PortalEvidenceReference) =>
      sanitized(async (): Promise<PortalVerifiedEvidence> => {
        const p = await policy(db, true),
          row = await locked(db, ref, p);
        if (row.status !== 'verified' || Number(row.token_expires_at) <= (await now(db)))
          throw oidcFailure();
        return {
          subject: row.subject,
          issuedAt: Number(row.token_issued_at),
          expiresAt: Number(row.token_expires_at),
          authenticationTime:
            row.authentication_time === null ? null : Number(row.authentication_time),
          beginSeq: row.exact_begin_seq,
          emergencyEpoch: row.exact_emergency_epoch,
          expectedCrmUserId: row.expected_crm_user_id,
        };
      }),
    // Correlation authenticates cancellation, independent of configuration rotation,
    // expiration and enabled policy. A consumed row is immutable: return its hash
    // for the FUTURE logout coordinator to revoke, never claim logout succeeded here.
    cancel: (id: string, browserHash: string) =>
      sanitized(async () => {
        uuid.parse(id);
        hash.parse(browserHash);
        return transaction(async (db) => {
          await policy(db, false);
          const [row] = await query<Row>(
            `SELECT ${columns} FROM identity_portal_oidc_attempts WHERE id=? AND browser_hash=? AND application='portal' AND provider='google' FOR UPDATE`,
            [id, browserHash],
            db,
          );
          if (
            !row ||
            row.browser_hash !== browserHash ||
            row.application !== 'portal' ||
            row.provider !== 'google'
          )
            throw oidcFailure();
          if (row.status === 'consumed')
            return { issuedSessionHash: hash.parse(row.issued_session_hash) };
          await invalidatePending(db, id);
          return { issuedSessionHash: null };
        });
      }),
  };
}
async function invalidatePending(db: Connection, id: string) {
  await execute(
    `UPDATE identity_portal_oidc_attempts SET status='invalidated',invalidated_at=${clock},${wipe},${erase} WHERE id=? AND status IN ('pending','claimed','verified')`,
    [id],
    db,
  );
}
