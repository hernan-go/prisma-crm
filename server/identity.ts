// Internal trusted service only. No router imports this module. External proofs and
// actor authorization MUST be verified by the future caller before using mutations.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { execute, query, transaction, type Connection } from './db.js';
import { AppError } from './errors.js';

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
    await transaction(async (db) => {
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
  await transaction(async (db) => {
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
  await transaction(async (db) => {
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
export async function createIdentitySession(userId: string, application: string, ttlMs: number) {
  idSchema.parse(userId);
  applicationSchema.parse(application);
  ttlSchema.parse(ttlMs);
  return transaction(async (db) => {
    const user = await lockedUser(userId, db);
    if (!permits(user, 'admin')) throw new AppError(403, 'Acceso no habilitado.');
    const token = randomBytes(32).toString('hex');
    const created = Date.now(),
      expires = created + ttlMs;
    await execute(
      'INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at) VALUES (?,?,?,?,?)',
      [sessionDigest(token), userId, application, created, expires],
      db,
    );
    await audit(db, userId, userId, 'session.created');
    return { token, expiresAt: expires };
  });
}
export async function authenticateIdentitySession(
  token: string,
  application: string,
): Promise<InstitutionalUser | undefined> {
  const hash = sessionDigest(token);
  if (!hash || !applicationSchema.safeParse(application).success) return undefined;
  // Lookup is only a hint. Recheck under the common user lock with a current read.
  const [hint] = await query<{ user_id: string }>(
    'SELECT user_id FROM identity_sessions WHERE token_hash=?',
    [hash],
  );
  if (!hint) return undefined;
  return transaction(async (db) => {
    const user = await lockedUser(hint.user_id, db);
    const [session] = await query<{ expires_at: number; revoked_at: number | null }>(
      'SELECT expires_at,revoked_at FROM identity_sessions WHERE token_hash=? AND user_id=? AND application=? FOR UPDATE',
      [hash, user.id, application],
      db,
    );
    if (
      !session ||
      session.revoked_at !== null ||
      Number(session.expires_at) <= Date.now() ||
      !permits(user, 'admin')
    )
      return undefined;
    return user;
  });
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
