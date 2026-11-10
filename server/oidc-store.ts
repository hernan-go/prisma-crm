// Trusted internal persistence. No HTTP consumer and no institutional mutations.
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { execute, query, transaction, type Connection } from './db.js';
import { oidcFailure } from './oidc-crypto.js';
import { lockInstitution } from './identity-policy.js';

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const contextSchema = z.discriminatedUnion('purpose', [
  z.object({ purpose: z.literal('login') }).strict(),
  z.object({ purpose: z.literal('binding'), userId: uuid, operationId: uuid }).strict(),
  z.object({ purpose: z.literal('reauth'), userId: uuid, sessionHash: hash }).strict(),
]);
export type OidcContext = z.infer<typeof contextSchema>;
export interface Attempt {
  id: string;
  configurationHash: string;
  stateHash: string;
  browserHash: string;
  nonce: string;
  keyId: string;
  encrypted: string;
  context: OidcContext;
}
export interface VerifiedGoogle {
  subject: string;
  issuedAt: number;
  expiresAt: number;
  authenticationTime: number | null;
}
export interface EvidenceReference {
  id: string;
  browserHash: string;
  configurationHash: string;
  context: OidcContext;
}
export interface OidcStore {
  create(attempt: Attempt): Promise<number>;
  claim(stateHash: string, reference: Omit<EvidenceReference, 'id'>): Promise<Attempt>;
  verify(reference: EvidenceReference, proof: VerifiedGoogle): Promise<void>;
  invalidate(reference: EvidenceReference): Promise<void>;
}
const clock = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';
const wipe = 'nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL';
const eraseProof =
  'subject=NULL,token_issued_at=NULL,token_expires_at=NULL,authentication_time=NULL';
interface Row {
  id: string;
  configuration_hash: string;
  state_hash: string;
  browser_hash: string;
  purpose: OidcContext['purpose'];
  user_id: string | null;
  binding_operation_id: string | null;
  initiator_session_hash: string | null;
  nonce: string;
  pkce_key_id: string;
  pkce_encrypted: string;
  status: string;
  expires_at: number;
  subject: string;
  token_issued_at: number;
  token_expires_at: number;
  authentication_time: number | null;
}
const contextValues = (c: OidcContext) => [
  c.purpose,
  'userId' in c ? c.userId : null,
  c.purpose === 'binding' ? c.operationId : null,
  c.purpose === 'reauth' ? c.sessionHash : null,
];
function matches(row: Row, ref: Omit<EvidenceReference, 'id'>) {
  const [purpose, user, operation, session] = contextValues(ref.context);
  if (
    row.configuration_hash !== ref.configurationHash ||
    row.browser_hash !== ref.browserHash ||
    row.purpose !== purpose ||
    row.user_id !== user ||
    row.binding_operation_id !== operation ||
    row.initiator_session_hash !== session
  )
    throw oidcFailure();
}
async function now(db: Connection) {
  return Number((await query<{ now: number }>(`SELECT ${clock} AS now`, [], db))[0].now);
}
// Context rows first, attempt second. B2 must acquire its institutional lock first.
// This validates correlation/liveness, never authorizes the actor to perform an effect.
async function contextLimit(db: Connection, context: OidcContext): Promise<number> {
  contextSchema.parse(context);
  if (context.purpose === 'login') return Number.MAX_SAFE_INTEGER;
  if (context.purpose === 'binding') {
    const [op] = await query<{ expires_at: number }>(
      'SELECT expires_at FROM identity_binding_operations WHERE id=? AND user_id=? AND consumed_at IS NULL AND revoked_at IS NULL FOR UPDATE',
      [context.operationId, context.userId],
      db,
    );
    if (!op) throw oidcFailure();
    return Number(op.expires_at);
  }
  const [session] = await query<{ expires_at: number }>(
    "SELECT expires_at FROM identity_sessions WHERE token_hash=? AND user_id=? AND application='crm' AND revoked_at IS NULL FOR UPDATE",
    [context.sessionHash, context.userId],
    db,
  );
  if (!session) throw oidcFailure();
  return Number(session.expires_at);
}
function referenceValid(ref: EvidenceReference) {
  uuid.parse(ref.id);
  hash.parse(ref.browserHash);
  hash.parse(ref.configurationHash);
  contextSchema.parse(ref.context);
}
async function locked(db: Connection, ref: EvidenceReference) {
  referenceValid(ref);
  const limit = await contextLimit(db, ref.context);
  const [row] = await query<Row>(
    'SELECT * FROM identity_oidc_attempts WHERE id=? FOR UPDATE',
    [ref.id],
    db,
  );
  if (!row) throw oidcFailure();
  matches(row, ref);
  const time = await now(db);
  if (Number(row.expires_at) <= time || limit <= time) throw oidcFailure();
  row.expires_at = Math.min(Number(row.expires_at), limit);
  return row;
}
export function mysqlOidcStore() {
  const store = {
    async create(a: Attempt) {
      referenceValid({ ...a });
      hash.parse(a.stateHash);
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(a.nonce) ||
        !/^[A-Za-z0-9_-]{1,32}$/.test(a.keyId) ||
        !/^[A-Za-z0-9_-]{95}$/.test(a.encrypted)
      )
        throw oidcFailure();
      return transaction(async (db) => {
        if (a.context.purpose === 'binding') {
          if (!(await lockInstitution(db))) throw oidcFailure();
        }
        const limit = await contextLimit(db, a.context),
          time = await now(db);
        if (a.context.purpose === 'binding') {
          await execute(
            `UPDATE identity_oidc_attempts SET status='invalidated',invalidated_at=${clock},${wipe},${eraseProof}
            WHERE browser_hash=? AND purpose='binding' AND status IN ('pending','claimed','verified')`,
            [a.browserHash],
            db,
          );
        }
        const expires = Math.min(time + 300000, limit);
        if (expires <= time) throw oidcFailure();
        await execute(
          `INSERT INTO identity_oidc_attempts
          (id,provider,application,configuration_hash,state_hash,browser_hash,nonce,pkce_key_id,pkce_encrypted,
           purpose,user_id,binding_operation_id,initiator_session_hash,status,created_at,expires_at)
          VALUES (?,'google','crm',?,?,?,?,?,?,?,?,?,?,'pending',?,?)`,
          [
            a.id,
            a.configurationHash,
            a.stateHash,
            a.browserHash,
            a.nonce,
            a.keyId,
            a.encrypted,
            ...contextValues(a.context),
            time,
            expires,
          ],
          db,
        );
        return expires;
      });
    },
    async claim(stateHash: string, ref: Omit<EvidenceReference, 'id'>): Promise<Attempt> {
      hash.parse(stateHash);
      hash.parse(ref.browserHash);
      hash.parse(ref.configurationHash);
      return transaction(async (db) => {
        const limit = await contextLimit(db, ref.context);
        const [row] = await query<Row>(
          'SELECT * FROM identity_oidc_attempts WHERE state_hash=? FOR UPDATE',
          [stateHash],
          db,
        );
        if (!row) throw oidcFailure();
        matches(row, ref);
        const result = await execute(
          `UPDATE identity_oidc_attempts SET status='claimed',claimed_at=${clock},${wipe}
          WHERE id=? AND status='pending' AND expires_at>${clock} AND ?>${clock}`,
          [row.id, limit],
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
          context: contextSchema.parse(ref.context),
        };
      });
    },
    async verify(ref: EvidenceReference, proof: VerifiedGoogle) {
      z.object({
        subject: z.string().regex(/^[\x21-\x7e]{1,255}$/),
        issuedAt: z.number().int().nonnegative(),
        expiresAt: z.number().int().positive(),
        authenticationTime: z.number().int().nonnegative().nullable(),
      })
        .strict()
        .parse(proof);
      await transaction(async (db) => {
        const row = await locked(db, ref);
        if (ref.context.purpose === 'reauth') {
          const [account] = await query<{ subject: string }>(
            "SELECT subject FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
            [ref.context.userId],
            db,
          );
          if (!account || account.subject !== proof.subject) throw oidcFailure();
        }
        const time = await now(db);
        if (ref.context.purpose === 'reauth' && proof.authenticationTime === null)
          throw oidcFailure();
        const expires = Math.min(
          Number(row.expires_at),
          proof.expiresAt,
          ref.context.purpose === 'reauth'
            ? proof.authenticationTime! + 300000
            : Number.MAX_SAFE_INTEGER,
        );
        if (
          proof.issuedAt > time + 30000 ||
          proof.expiresAt <= proof.issuedAt ||
          expires <= time ||
          (proof.authenticationTime !== null &&
            (proof.authenticationTime > time + 30000 || proof.authenticationTime > proof.issuedAt))
        )
          throw oidcFailure();
        const result = await execute(
          `UPDATE identity_oidc_attempts SET status='verified',verified_at=${clock},
          expires_at=?,subject=?,token_issued_at=?,token_expires_at=?,authentication_time=?
          WHERE id=? AND status='claimed' AND expires_at>${clock} AND ?>${clock}`,
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
    },
    // Does not require a live context: revoked/expired contexts still allow erasure.
    async invalidate(ref: EvidenceReference) {
      referenceValid(ref);
      await transaction(async (db) => {
        const [row] = await query<Row>(
          'SELECT * FROM identity_oidc_attempts WHERE id=? FOR UPDATE',
          [ref.id],
          db,
        );
        if (!row) throw oidcFailure();
        matches(row, ref);
        await execute(
          `UPDATE identity_oidc_attempts SET status='invalidated',invalidated_at=${clock},${wipe},${eraseProof}
          WHERE id=? AND status IN ('pending','claimed','verified')`,
          [ref.id],
          db,
        );
      });
    },
    // Caller supplies an active transaction and must rollback on any failure.
    // B2 will consume here and perform its authorized effect on this SAME connection.
    async consumeEvidence(db: PoolConnection, ref: EvidenceReference): Promise<VerifiedGoogle> {
      const row = await locked(db, ref);
      const result = await execute(
        `UPDATE identity_oidc_attempts SET status='consumed',consumed_at=${clock},${eraseProof}
        WHERE id=? AND status='verified' AND expires_at>${clock} AND ?>${clock}`,
        [ref.id, row.expires_at],
        db,
      );
      if (result.affectedRows !== 1) throw oidcFailure();
      return {
        subject: row.subject,
        issuedAt: Number(row.token_issued_at),
        expiresAt: Number(row.token_expires_at),
        authenticationTime:
          row.authentication_time === null ? null : Number(row.authentication_time),
      };
    },
    // Explicit maintenance; not scheduled/mounted in B1. Eligible terminal rows are
    // purged 24 hours past expiry WHEN invoked. No institutional/audit data is deleted.
    async cleanup() {
      await transaction(async (db) => {
        const associated =
          (await query("SELECT name FROM schema_migrations WHERE name='020.sql'", [], db)).length >
          0;
        if (associated) await lockInstitution(db);
        // Current reads before touching attempts: serialize issuance and acquire
        // session locks before attempt locks, as reauthentication already does.
        const live = associated
          ? await query<{ token_hash: string }>(
              `SELECT token_hash FROM identity_sessions WHERE application='crm' AND revoked_at IS NULL AND expires_at>${clock} ORDER BY token_hash FOR UPDATE`,
              [],
              db,
            )
          : [];
        await execute(
          `UPDATE identity_oidc_attempts SET status='invalidated',invalidated_at=${clock},${wipe},${eraseProof}
          WHERE expires_at<=${clock} AND status IN ('pending','claimed','verified')`,
          [],
          db,
        );
        // Preserve B1/B2 on 019-only installations. A mapped login attempt must
        // survive for as long as the emitted session could still authorize.
        await execute(
          `DELETE FROM identity_oidc_attempts WHERE expires_at<${clock}-86400000
          AND status IN ('consumed','invalidated')` +
            (associated && live.length
              ? `
          AND (issued_session_hash IS NULL OR issued_session_hash NOT IN (${live.map(() => '?').join(',')}))
          AND NOT (purpose='login' AND status='consumed' AND issued_session_hash IS NULL)`
              : ''),
          live.map((session) => session.token_hash),
          db,
        );
      });
    },
  } satisfies OidcStore & {
    consumeEvidence(db: PoolConnection, ref: EvidenceReference): Promise<VerifiedGoogle>;
    cleanup(): Promise<void>;
  };
  // Keep driver errors (which may contain SQL parameters) inside this boundary.
  const safe =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch {
        throw oidcFailure();
      }
    };
  return {
    create: safe(store.create),
    claim: safe(store.claim),
    verify: safe(store.verify),
    invalidate: safe(store.invalidate),
    consumeEvidence: safe(store.consumeEvidence),
    cleanup: safe(store.cleanup),
  };
}
