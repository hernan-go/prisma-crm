// No default service, HTTP routes, verifier or privileged production adapter.
// Composition root must supply real authorization and proof validation in 12.2.B.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { execute, query, type Connection } from './db.js';
import { identityMutation, lockInstitution, activeAdministrators } from './identity-policy.js';
import { AppError } from './errors.js';
const uuid = z.string().uuid();
const subjectSchema = z.string().regex(/^[\x21-\x7e]{1,255}$/);
const lifetime = 15 * 60 * 1000;
type Action =
  'configure' | 'issue' | 'approve' | 'revoke' | 'suspend' | 'remove-role' | 'unlink' | 'retire';
export interface BindingAuthority {
  authorize(
    context: unknown,
    action: Action,
  ): Promise<{ kind: 'operator' } | { kind: 'admin'; userId: string }>;
  verifyCandidate(
    evidence: unknown,
    binding: { operationId: string; userId: string },
  ): Promise<{ provider: 'google'; subject: string }>;
}
interface Operation {
  id: string;
  user_id: string;
  purpose: 'initial' | 'replace';
  code_hash: string;
  expires_at: number;
  subject: string | null;
  expected_subject: string | null;
  consumed_at: number | null;
  revoked_at: number | null;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
async function audit(db: Connection, userId: string, actor: string | null, event: string) {
  await execute(
    'INSERT INTO identity_audit_events(user_id,actor_id,event) VALUES (?,?,?)',
    [userId, actor, event],
    db,
  );
}
async function currentSubject(db: Connection, id: string) {
  const [row] = await query<{ subject: string }>(
    "SELECT subject FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
    [id],
    db,
  );
  return row?.subject ?? null;
}
async function revokeSessions(db: Connection, id: string) {
  await execute(
    'UPDATE identity_sessions SET revoked_at=GREATEST(created_at,?) WHERE user_id=? AND revoked_at IS NULL',
    [Date.now(), id],
    db,
  );
}
export function createBindingService(authority: BindingAuthority) {
  async function authorized(
    db: Connection,
    context: unknown,
    action: Action,
    operatorOnly = false,
  ) {
    const actor = await authority.authorize(context, action);
    if (actor.kind === 'operator') return null;
    if (operatorOnly) throw new AppError(403, 'Requiere canal operativo privilegiado.');
    uuid.parse(actor.userId);
    if (!(await activeAdministrators(db)).some((u) => u.id === actor.userId))
      throw new AppError(403, 'Administrador no habilitado.');
    return actor.userId;
  }
  async function state(db: Connection) {
    const value = await lockInstitution(db);
    if (!value) throw new AppError(503, 'Se requiere migración 018.');
    return value;
  }
  async function operation(db: Connection, id: string, userId: string) {
    uuid.parse(id);
    uuid.parse(userId);
    const [op] = await query<Operation>(
      'SELECT * FROM identity_binding_operations WHERE id=? AND user_id=? FOR UPDATE',
      [id, userId],
      db,
    );
    if (
      !op ||
      op.consumed_at !== null ||
      op.revoked_at !== null ||
      Number(op.expires_at) <= Date.now()
    )
      throw new AppError(409, 'Operación no disponible.');
    return op;
  }
  return {
    async configure(context: unknown, ids: [string, string]) {
      ids.forEach((id) => uuid.parse(id));
      if (ids[0] === ids[1]) throw new AppError(409, 'Se requieren dos identidades distintas.');
      await identityMutation(async (db) => {
        const s = await state(db);
        await authorized(db, context, 'configure', true);
        if (s.initialized || s.admin_one !== null || s.admin_two !== null)
          throw new AppError(409, 'Inicialización ya configurada.');
        for (const id of ids) {
          const [u] = await query<{ status: string }>(
            'SELECT status FROM identity_users WHERE id=? FOR UPDATE',
            [id],
            db,
          );
          const roles = await query(
            'SELECT role FROM identity_user_roles WHERE user_id=?',
            [id],
            db,
          );
          if (!u || u.status !== 'disabled' || roles.length || (await currentSubject(db, id)))
            throw new AppError(409, 'Identidad inicial no disponible.');
        }
        await execute(
          'UPDATE identity_institution SET admin_one=?,admin_two=? WHERE id=1',
          ids,
          db,
        );
        for (const id of ids) await audit(db, id, null, 'bootstrap.configured');
      });
    },
    async issue(context: unknown, userId: string, purpose: 'initial' | 'replace') {
      uuid.parse(userId);
      z.enum(['initial', 'replace']).parse(purpose);
      return identityMutation(async (db) => {
        const s = await state(db);
        const actor = await authorized(db, context, 'issue', purpose === 'initial');
        if (![s.admin_one, s.admin_two].includes(userId))
          throw new AppError(403, 'Identidad no prevista.');
        if (purpose === 'initial' && s.initialized)
          throw new AppError(409, 'Inicialización cerrada.');
        if (purpose === 'replace' && (!s.initialized || actor === userId))
          throw new AppError(403, 'Reemplazo no autorizado.');
        const previous = await currentSubject(db, userId);
        if (purpose === 'initial' && previous) throw new AppError(409, 'Identidad ya vinculada.');
        const code = randomBytes(32).toString('hex'),
          id = randomUUID();
        const [clock] = await query<{ now: number }>(
          'SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) AS now',
          [],
          db,
        );
        const now = Number(clock.now);
        await execute(
          'UPDATE identity_binding_operations SET revoked_at=? WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL',
          [now, userId],
          db,
        );
        await execute(
          'INSERT INTO identity_binding_operations(id,user_id,purpose,code_hash,created_at,expires_at,expected_subject) VALUES (?,?,?,?,?,?,?)',
          [id, userId, purpose, digest(code), now, now + lifetime, previous],
          db,
        );
        await audit(db, userId, actor, 'binding.issued');
        return { operationId: id, code, expiresAt: now + lifetime };
      });
    },
    async submitCandidate(operationId: string, userId: string, code: string, evidence: unknown) {
      uuid.parse(operationId);
      uuid.parse(userId);
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(code);
      // The adapter MUST validate cryptographic evidence and correlation, not
      // deserialize a subject supplied by an HTTP caller. There is no adapter here.
      const proof = await authority.verifyCandidate(evidence, { operationId, userId });
      z.literal('google').parse(proof.provider);
      subjectSchema.parse(proof.subject);
      await identityMutation(async (db) => {
        await state(db);
        const op = await operation(db, operationId, userId);
        if (
          !timingSafeEqual(Buffer.from(op.code_hash, 'hex'), Buffer.from(digest(code), 'hex')) ||
          op.subject !== null
        )
          throw new AppError(409, 'Candidatura no disponible.');
        await execute(
          'UPDATE identity_binding_operations SET subject=?,candidate_at=? WHERE id=?',
          [proof.subject, Date.now(), operationId],
          db,
        );
        await audit(db, userId, null, 'binding.candidate');
      });
    },
    async approve(context: unknown, operationId: string, userId: string) {
      await identityMutation(async (db) => {
        const s = await state(db),
          op = await operation(db, operationId, userId);
        const actor = await authorized(db, context, 'approve', op.purpose === 'initial');
        if (!op.subject || ![s.admin_one, s.admin_two].includes(userId))
          throw new AppError(409, 'Candidatura no disponible.');
        if (op.purpose === 'initial' ? s.initialized : !s.initialized || actor === userId)
          throw new AppError(403, 'Aprobación no permitida.');
        if ((await currentSubject(db, userId)) !== op.expected_subject)
          throw new AppError(409, 'La vinculación cambió.');
        const used = await query(
          'SELECT user_id FROM identity_external_accounts WHERE provider=? AND subject=? FOR UPDATE',
          ['google', op.subject],
          db,
        );
        if (used.length) throw new AppError(409, 'Identidad externa ya vinculada.');
        // Linearization point after authorization and related-row checks. MySQL's
        // clock decides validity; a failed claim rolls back the entire operation.
        const claim = await execute(
          `UPDATE identity_binding_operations
           SET consumed_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)
           WHERE id=? AND user_id=? AND consumed_at IS NULL AND revoked_at IS NULL
           AND expires_at>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)`,
          [operationId, userId],
          db,
        );
        if (claim.affectedRows !== 1)
          throw new AppError(409, 'Operación no disponible al aprobar.');
        await execute(
          "DELETE FROM identity_external_accounts WHERE user_id=? AND provider='google'",
          [userId],
          db,
        );
        await execute(
          "INSERT INTO identity_external_accounts(provider,subject,user_id) VALUES ('google',?,?)",
          [op.subject, userId],
          db,
        );
        if (op.purpose === 'initial') {
          await execute(
            "INSERT INTO identity_user_roles(user_id,role) VALUES (?,'admin')",
            [userId],
            db,
          );
          await execute("UPDATE identity_users SET status='enabled' WHERE id=?", [userId], db);
        }
        await revokeSessions(db, userId);
        await audit(
          db,
          userId,
          actor,
          op.purpose === 'initial' ? 'binding.initial.approved' : 'binding.replaced',
        );
        const admins = await activeAdministrators(db);
        if (
          !s.initialized &&
          [s.admin_one, s.admin_two].every((id) => admins.some((a) => a.id === id))
        ) {
          await execute('UPDATE identity_institution SET initialized=TRUE WHERE id=1', [], db);
          await execute(
            "UPDATE identity_binding_operations SET revoked_at=? WHERE purpose='initial' AND consumed_at IS NULL AND revoked_at IS NULL",
            [Date.now()],
            db,
          );
          await audit(db, userId, null, 'bootstrap.closed');
        }
      });
    },
    async revoke(context: unknown, operationId: string, userId: string) {
      await identityMutation(async (db) => {
        await state(db);
        const op = await operation(db, operationId, userId);
        const actor = await authorized(db, context, 'revoke', op.purpose === 'initial');
        await execute(
          'UPDATE identity_binding_operations SET revoked_at=? WHERE id=?',
          [Date.now(), operationId],
          db,
        );
        await audit(db, userId, actor, 'binding.revoked');
      });
    },
    async restrict(context: unknown, userId: string, action: 'suspend' | 'remove-role' | 'unlink') {
      uuid.parse(userId);
      z.enum(['suspend', 'remove-role', 'unlink']).parse(action);
      await identityMutation(async (db) => {
        const s = await state(db);
        if (!s.initialized) throw new AppError(409, 'Inicialización pendiente.');
        const actor = await authorized(db, context, action);
        if (action === 'suspend')
          await execute("UPDATE identity_users SET status='disabled' WHERE id=?", [userId], db);
        if (action === 'remove-role')
          await execute(
            "DELETE FROM identity_user_roles WHERE user_id=? AND role='admin'",
            [userId],
            db,
          );
        if (action === 'unlink')
          await execute(
            "DELETE FROM identity_external_accounts WHERE user_id=? AND provider='google'",
            [userId],
            db,
          );
        await revokeSessions(db, userId);
        await audit(db, userId, actor, 'admin.' + action);
      });
    },
  };
}
