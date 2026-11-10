// Internal trusted service only. No router imports this module. External proofs and
// actor authorization MUST be verified by the future caller before using mutations.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { execute, query, transaction, type Connection } from './db.js';
import { mysqlOidcStore, type EvidenceReference } from './oidc-store.js';
import { AppError } from './errors.js';
import { identityMutation, lockInstitution } from './identity-policy.js';

const idSchema = z.string().uuid();
const roleSchema = z.enum(['admin', 'facilitator', 'participant']);
export type IdentityRole = z.infer<typeof roleSchema>;
const statusSchema = z.enum(['enabled', 'disabled']);
type Status = z.infer<typeof statusSchema>;
const providerSchema = z.literal('google');
const subjectSchema = z.string().regex(/^[\x21-\x7e]{1,255}$/);
const applicationSchema = z.literal('crm');
const ttlSchema = z
  .number()
  .int()
  .min(1)
  .max(8 * 60 * 60 * 1000);
export interface InstitutionalUser {
  id: string;
  display_name: string;
  status: Status;
  roles: IdentityRole[];
}

export function sessionDigest(token: string): string | undefined {
  return /^[a-f0-9]{64}$/.test(token)
    ? createHash('sha256').update(token).digest('hex')
    : undefined;
}
export function permits(user: InstitutionalUser, role: IdentityRole): boolean {
  return user.status === 'enabled' && user.roles.includes(role);
}
async function readUser(
  id: string,
  db: Connection,
  lock = false,
): Promise<InstitutionalUser | undefined> {
  const [user] = await query<Omit<InstitutionalUser, 'roles'>>(
    'SELECT id,display_name,status FROM identity_users WHERE id=?' + (lock ? ' FOR UPDATE' : ''),
    [id],
    db,
  );
  if (!user) return undefined;
  const roles = await query<{ role: IdentityRole }>(
    'SELECT role FROM identity_user_roles WHERE user_id=? ORDER BY role' +
      (lock ? ' FOR UPDATE' : ''),
    [id],
    db,
  );
  return { ...user, roles: roles.map((r) => r.role) };
}
async function lockedUser(id: string, db: Connection) {
  const user = await readUser(id, db, true);
  if (!user) throw new AppError(404, 'Identidad inexistente.');
  return user;
}
async function audit(db: Connection, user: string, actor: string | null, event: string) {
  if (actor !== null) idSchema.parse(actor);
  await execute(
    'INSERT INTO identity_audit_events(user_id,actor_id,event) VALUES (?,?,?)',
    [user, actor, event],
    db,
  );
}
export async function getIdentity(id: string) {
  idSchema.parse(id);
  return transaction((db) => readUser(id, db, true));
}
export async function findExternalIdentity(provider: string, subject: string) {
  providerSchema.parse(provider);
  subjectSchema.parse(subject);
  const [row] = await query<{ user_id: string }>(
    'SELECT user_id FROM identity_external_accounts WHERE provider=? AND subject=?',
    [provider, subject],
  );
  return row ? getIdentity(row.user_id) : undefined;
}
export async function createIdentity(displayName: string, actor: string | null) {
  const name = z.string().trim().min(1).max(200).parse(displayName);
  const id = randomUUID();
  await transaction(async (db) => {
    await execute('INSERT INTO identity_users(id,display_name) VALUES (?,?)', [id, name], db);
    await audit(db, id, actor, 'user.created');
  });
  return id;
}
export async function linkExternalIdentity(
  userId: string,
  provider: string,
  subject: string,
  actor: string | null,
) {
  idSchema.parse(userId);
  providerSchema.parse(provider);
  subjectSchema.parse(subject);
  try {
    await identityMutation(async (db) => {
      const institution = await lockInstitution(db);
      if (institution && [institution.admin_one, institution.admin_two].includes(userId))
        throw new AppError(409, 'Usá la operación supervisada de vinculación.');
      await lockedUser(userId, db);
      const [existing] = await query<{ user_id: string }>(
        'SELECT user_id FROM identity_external_accounts WHERE provider=? AND subject=?',
        [provider, subject],
        db,
      );
      if (existing?.user_id === userId) return;
      if (existing) throw new AppError(409, 'Identidad externa ya vinculada.');
      await execute(
        'INSERT INTO identity_external_accounts(provider,subject,user_id) VALUES (?,?,?)',
        [provider, subject, userId],
        db,
      );
      await audit(db, userId, actor, 'external.linked');
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
      throw new AppError(409, 'Identidad externa ya vinculada.');
    throw error;
  }
}
async function revokeAll(db: Connection, userId: string) {
  await execute(
    'UPDATE identity_sessions SET revoked_at=GREATEST(created_at,?) WHERE user_id=? AND revoked_at IS NULL',
    [Date.now(), userId],
    db,
  );
}
export async function setIdentityStatus(userId: string, status: Status, actor: string | null) {
  idSchema.parse(userId);
  statusSchema.parse(status);
  await identityMutation(async (db) => {
    const institution = await lockInstitution(db);
    if (
      status === 'enabled' &&
      institution &&
      [institution.admin_one, institution.admin_two].includes(userId)
    ) {
      const bound = await query(
        "SELECT user_id FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
        [userId],
        db,
      );
      if (!bound.length) throw new AppError(409, 'Aprobación de vinculación pendiente.');
    }
    const user = await lockedUser(userId, db);
    if (user.status === status) return;
    await execute('UPDATE identity_users SET status=? WHERE id=?', [status, userId], db);
    await revokeAll(db, userId);
    await audit(db, userId, actor, 'user.' + status);
  });
}
export async function setIdentityRole(
  userId: string,
  role: IdentityRole,
  granted: boolean,
  actor: string | null,
) {
  idSchema.parse(userId);
  roleSchema.parse(role);
  z.boolean().parse(granted);
  await identityMutation(async (db) => {
    const institution = await lockInstitution(db);
    if (
      granted &&
      role === 'admin' &&
      institution &&
      [institution.admin_one, institution.admin_two].includes(userId)
    ) {
      const bound = await query(
        "SELECT user_id FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
        [userId],
        db,
      );
      if (!bound.length) throw new AppError(409, 'Aprobación de vinculación pendiente.');
    }
    const user = await lockedUser(userId, db);
    if (user.roles.includes(role) === granted) return;
    if (granted)
      await execute(
        'INSERT INTO identity_user_roles(user_id,role) VALUES (?,?)',
        [userId, role],
        db,
      );
    else
      await execute(
        'DELETE FROM identity_user_roles WHERE user_id=? AND role=?',
        [userId, role],
        db,
      );
    // Neither removed nor newly granted privileges are inherited by old sessions.
    await revokeAll(db, userId);
    await audit(db, userId, actor, (granted ? 'role.granted.' : 'role.revoked.') + role);
  });
}
async function insertSession(db: Connection, userId: string, application: string, ttlMs: number) {
  const token = randomBytes(32).toString('hex');
  const created = Number(
      (
        await query(
          'SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) AS now',
          [],
          db,
        )
      )[0].now,
    ),
    expires = created + ttlMs;
  await execute(
    'INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at) VALUES (?,?,?,?,?)',
    [sessionDigest(token), userId, application, created, expires],
    db,
  );
  await audit(db, userId, userId, 'session.created');
  return { token, expiresAt: expires };
}
/** Internal callback consumer. Only persisted, verified login evidence authorizes issuance. */
export async function completeGoogleLogin(reference: EvidenceReference) {
  const deny = () => new AppError(403, 'Acceso no habilitado.');
  if (reference?.context?.purpose !== 'login') throw deny();
  return transaction(async (db) => {
    const institution = await lockInstitution(db);
    if (!institution?.initialized) throw deny();
    // Snapshot lookup is only a hint. Recheck the account under the institutional/user locks.
    const [hint] = await query<{ user_id: string }>(
      "SELECT e.user_id FROM identity_oidc_attempts a JOIN identity_external_accounts e ON e.provider=a.provider AND e.subject=a.subject WHERE a.id=? AND a.status='verified' AND a.purpose='login' AND a.application='crm' AND a.provider='google'",
      [reference.id],
      db,
    );
    if (!hint || ![institution.admin_one, institution.admin_two].includes(hint.user_id))
      throw deny();
    const user = await lockedUser(hint.user_id, db);
    if (!permits(user, 'admin')) throw deny();
    const [account] = await query<{ subject: string }>(
      "SELECT subject FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
      [user.id],
      db,
    );
    const proof = await mysqlOidcStore().consumeEvidence(db, reference);
    if (!account || account.subject !== proof.subject) throw deny();
    const session = await insertSession(db, user.id, 'crm', 8 * 60 * 60 * 1000);
    const associated = await execute(
      "UPDATE identity_oidc_attempts SET issued_session_hash=? WHERE id=? AND status='consumed' AND purpose='login' AND issued_session_hash IS NULL",
      [sessionDigest(session.token), reference.id],
      db,
    );
    if (associated.affectedRows !== 1) throw deny();
    return session;
  });
}
export async function createIdentitySession(userId: string, application: string, ttlMs: number) {
  idSchema.parse(userId);
  applicationSchema.parse(application);
  ttlSchema.parse(ttlMs);
  return transaction(async (db) => {
    const user = await lockedUser(userId, db);
    if (!permits(user, 'admin')) throw new AppError(403, 'Acceso no habilitado.');
    return insertSession(db, userId, application, ttlMs);
  });
}
export async function authenticateIdentitySession(
  token: string,
  application: string,
  options: { requireInstitution?: boolean } = {},
): Promise<(InstitutionalUser & { expiresAt: number }) | undefined> {
  const hash = sessionDigest(token);
  if (!hash || !applicationSchema.safeParse(application).success) return undefined;
  // Lookup is only a hint. Recheck under the common user lock with a current read.
  const [hint] = await query<{ user_id: string }>(
    'SELECT user_id FROM identity_sessions WHERE token_hash=?',
    [hash],
  );
  if (!hint) return undefined;
  return transaction(async (db) => {
    const institution = await lockInstitution(db);
    if (
      options.requireInstitution &&
      (!institution?.initialized ||
        !institution.admin_one ||
        !institution.admin_two ||
        institution.admin_one === institution.admin_two ||
        ![institution.admin_one, institution.admin_two].includes(hint.user_id))
    )
      return undefined;
    const user = await lockedUser(hint.user_id, db);
    if (options.requireInstitution) {
      const accounts = await query(
        "SELECT subject FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
        [user.id],
        db,
      );
      if (!accounts.length) return undefined;
    }
    const [session] = await query<{ live: number; revoked_at: number | null; expires_at: number }>(
      'SELECT expires_at,expires_at>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) AS live,revoked_at FROM identity_sessions WHERE token_hash=? AND user_id=? AND application=? FOR UPDATE',
      [hash, user.id, application],
      db,
    );
    if (!session || session.revoked_at !== null || !session.live || !permits(user, 'admin'))
      return undefined;
    return { ...user, expiresAt: Number(session.expires_at) };
  });
}
/** Resolve ownership from the opaque credential, including expired/revoked sessions. */
export async function revokePresentedIdentitySession(token: string) {
  const hash = sessionDigest(token);
  if (!hash) return;
  await revokeIssuedSession(hash);
}
// The hash is obtained only from a server digest or a validated persisted attempt.
// Resolve ownership without requiring the session to remain enabled/live.
async function revokeIssuedSession(hash: string) {
  const [session] = await query<{ user_id: string }>(
    "SELECT user_id FROM identity_sessions WHERE token_hash=? AND application='crm'",
    [hash],
  );
  if (session) await revokeSessionHash(session.user_id, hash, session.user_id);
}
/** Serialize logout with evidence consumption, without holding locks across Google. */
export async function cancelPresentedGoogleLogin(reference: EvidenceReference) {
  if (reference.context.purpose !== 'login') throw new AppError(409, 'Intento de acceso inválido.');
  idSchema.parse(reference.id);
  const issuedHash = await transaction(async (db) => {
    await lockInstitution(db);
    const [attempt] = await query<{ status: string; issued_session_hash: string | null }>(
      // Revocation validates the persisted browser credential, not current OIDC
      // client settings: rotation must not strand a session already issued.
      "SELECT status,issued_session_hash FROM identity_oidc_attempts WHERE id=? AND browser_hash=? AND purpose='login' AND application='crm' AND provider='google' FOR UPDATE",
      [reference.id, reference.browserHash],
      db,
    );
    if (!attempt) return;
    if (attempt.status === 'consumed') {
      // Legacy consumed evidence cannot be correlated safely by inference.
      if (!attempt.issued_session_hash)
        throw new AppError(
          409,
          'Acceso anterior sin asociación de sesión. Requiere revisión operativa.',
        );
      return attempt.issued_session_hash;
    }
    await execute(
      "UPDATE identity_oidc_attempts SET status='invalidated',invalidated_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED),nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL,subject=NULL,token_issued_at=NULL,token_expires_at=NULL,authentication_time=NULL WHERE id=? AND status IN ('pending','claimed','verified')",
      [reference.id],
      db,
    );
  });
  // Release institution/attempt locks before acquiring user/session locks. A
  // consumed attempt is terminal and its association cannot be changed by this
  // service. Logout waits for the specific revocation to commit before success.
  if (issuedHash) await revokeIssuedSession(issuedHash);
}
export async function revokeIdentitySessions(userId: string, actor: string | null) {
  idSchema.parse(userId);
  await transaction(async (db) => {
    await lockedUser(userId, db);
    await revokeAll(db, userId);
    await audit(db, userId, actor, 'sessions.revoked');
  });
}
export async function revokeIdentitySession(userId: string, token: string, actor: string | null) {
  idSchema.parse(userId);
  const hash = sessionDigest(token);
  if (!hash) return;
  await revokeSessionHash(userId, hash, actor);
}
async function revokeSessionHash(userId: string, hash: string, actor: string | null) {
  await transaction(async (db) => {
    await lockedUser(userId, db);
    const result = await execute(
      'UPDATE identity_sessions SET revoked_at=GREATEST(created_at,?) WHERE token_hash=? AND user_id=? AND revoked_at IS NULL',
      [Date.now(), hash, userId],
      db,
    );
    if (result.affectedRows) await audit(db, userId, actor, 'session.revoked');
  });
}
