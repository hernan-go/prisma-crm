import { z } from 'zod';
import { peopleTransaction, query, execute, type Connection } from './db.js';
import { sessionDigest } from './identity.js';
import { AppError } from './errors.js';
import { commercialDate } from '../shared/education.js';

const id = z.number().int().positive();
const base = {
  operationId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(500),
};
export const educationCommand = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('link'),
      userId: z.string().uuid(),
      personId: id,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('presential'),
      personId: id,
      activityId: id,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('digital'),
      personId: id,
      activityId: id,
      verificationReference: z.string().trim().min(1).max(150),
      paymentVerified: z.literal(true),
      expectedWindow: z
        .object({ startDate: z.iso.date(), endDate: z.iso.date() })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ ...base, kind: z.literal('revoke'), rightId: z.string().uuid() }).strict(),
]);
// Calendar arithmetic in fixed UTC-03:00 (Argentina commercial convention).
export function quarterEnd(start: number): number {
  if (!Number.isSafeInteger(start) || start < 0) throw new Error('Invalid instant');
  const local = new Date(start - 10800000);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 3);
  const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, last));
  const end = local.getTime() + 10800000;
  if (!Number.isSafeInteger(end)) throw new Error('Invalid instant');
  return end;
}
export function hasEducationalAccess(
  presential: boolean,
  rights: { starts_at: number; ends_at: number; revoked: boolean }[],
  now: number,
) {
  return (
    Number.isSafeInteger(now) &&
    (presential || rights.some((r) => !r.revoked && r.starts_at <= now && now < r.ends_at))
  );
}
const clock = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';
export async function lockEducation(db: Connection) {
  await query('SELECT id FROM identity_institution WHERE id=1 FOR UPDATE', [], db);
  const [state] = await query('SELECT revision FROM education_state WHERE id=1 FOR UPDATE', [], db);
  if (!state) throw new AppError(503, 'Fundamento educativo no disponible.');
  return Number(state.revision);
}
export async function authorizeEducation(db: Connection, token: string) {
  const hash = sessionDigest(token);
  if (!hash) throw new AppError(403, 'Requiere sesión administrativa individual.');
  const rows = await query(
    `SELECT s.user_id FROM identity_sessions s
    JOIN identity_users u ON u.id=s.user_id AND u.status='enabled'
    JOIN identity_user_roles r ON r.user_id=u.id AND r.role='admin'
    JOIN identity_external_accounts g ON g.user_id=u.id AND g.provider='google'
    JOIN identity_institution i ON i.id=1 AND i.initialized=1 AND (i.admin_one=u.id OR i.admin_two=u.id)
    WHERE s.token_hash=? AND s.application='crm' AND s.revoked_at IS NULL AND s.expires_at>${clock} FOR UPDATE`,
    [hash],
    db,
  );
  if (rows.length !== 1) throw new AppError(403, 'Requiere sesión administrativa individual.');
  return { actor: String(rows[0].user_id), session: hash };
}
// Internal only: no router, CLI, automatic payment hook or participant authentication.
export async function mutateEducation(adminToken: string, raw: unknown) {
  const input = educationCommand.parse(raw);
  return peopleTransaction(async (db) => {
    const revision = await lockEducation(db);
    const actor = await authorizeEducation(db, adminToken);
    const request = JSON.stringify({ ...actor, input });
    const [previous] = await query(
      'SELECT request_json,result_json FROM education_operations WHERE operation_id=? FOR UPDATE',
      [input.operationId],
      db,
    );
    if (previous) {
      const stored =
        typeof previous.request_json === 'string'
          ? JSON.parse(previous.request_json)
          : previous.request_json;
      // JSON columns may reorder object keys.
      if (
        stored.actor !== actor.actor ||
        stored.session !== actor.session ||
        JSON.stringify(educationCommand.parse(stored.input)) !== JSON.stringify(input)
      )
        throw new AppError(409, 'Operación reutilizada con otro contexto.');
      return typeof previous.result_json === 'string'
        ? JSON.parse(previous.result_json)
        : previous.result_json;
    }
    if (revision !== input.expectedRevision)
      throw new AppError(409, 'Revisión educativa obsoleta.');
    const [time] = await query(`SELECT ${clock} now_ms`, [], db);
    const now = Number(time.now_ms);
    if ('personId' in input) {
      const [p] = await query(
        'SELECT id FROM people WHERE id=? AND activo=1 FOR UPDATE',
        [input.personId],
        db,
      );
      if (!p) throw new AppError(409, 'Persona no habilitada.');
    }
    if ('activityId' in input) {
      const [a] = await query(
        'SELECT id FROM activities WHERE id=? FOR UPDATE',
        [input.activityId],
        db,
      );
      if (!a) throw new AppError(409, 'Actividad inexistente.');
    }
    let result: Record<string, unknown> = { revision: revision + 1 };
    if (input.kind === 'link') {
      const [u] = await query(
        'SELECT id FROM identity_users WHERE id=? FOR UPDATE',
        [input.userId],
        db,
      );
      if (!u) throw new AppError(409, 'Identidad inexistente.');
      const links = await query(
        'SELECT user_id,person_id FROM education_person_links WHERE user_id=? OR person_id=? FOR UPDATE',
        [input.userId, input.personId],
        db,
      );
      if (links.some((l) => l.user_id !== input.userId || l.person_id !== input.personId))
        throw new AppError(409, 'Vinculación incompatible.');
      await execute(
        'INSERT INTO education_person_links(user_id,person_id,enabled) VALUES (?,?,?) ON DUPLICATE KEY UPDATE enabled=?',
        [input.userId, input.personId, input.enabled, input.enabled],
        db,
      );
    } else if (input.kind === 'presential') {
      await execute(
        'INSERT INTO education_presential(person_id,activity_id,enabled) VALUES (?,?,?) ON DUPLICATE KEY UPDATE enabled=?',
        [input.personId, input.activityId, input.enabled, input.enabled],
        db,
      );
    } else if (input.kind === 'digital') {
      const duplicate = await query(
        'SELECT id FROM education_digital_rights WHERE verification_reference=? FOR UPDATE',
        [input.verificationReference],
        db,
      );
      if (duplicate.length) throw new AppError(409, 'Confirmación ya utilizada.');
      const [last] = await query(
        'SELECT MAX(ends_at) last_end,COUNT(*) previous_count FROM education_digital_rights WHERE person_id=? AND activity_id=? AND revoked_at IS NULL',
        [input.personId, input.activityId],
        db,
      );
      const startsAt = Math.max(now, Number(last?.last_end ?? 0));
      const endsAt = quarterEnd(startsAt);
      if (
        input.expectedWindow &&
        (commercialDate(startsAt) !== input.expectedWindow.startDate ||
          commercialDate(endsAt) !== input.expectedWindow.endDate)
      )
        throw new AppError(409, 'Las fechas cambiaron. Revisá la vigencia antes de confirmar.');
      await execute(
        'INSERT INTO education_digital_rights(id,person_id,activity_id,starts_at,ends_at,verification_reference) VALUES (?,?,?,?,?,?)',
        [
          input.operationId,
          input.personId,
          input.activityId,
          startsAt,
          endsAt,
          input.verificationReference,
        ],
        db,
      );
      result = {
        ...result,
        action: Number(last?.previous_count ?? (last?.last_end ? 1 : 0)) > 0 ? 'renewal' : 'grant',
        previousEnd: last?.last_end == null ? null : Number(last.last_end),
        rightId: input.operationId,
        startsAt,
        endsAt,
      };
    } else {
      const [right] = await query(
        'SELECT id,revoked_at FROM education_digital_rights WHERE id=? FOR UPDATE',
        [input.rightId],
        db,
      );
      if (!right) throw new AppError(404, 'Derecho inexistente.');
      await execute(
        'UPDATE education_digital_rights SET revoked_at=COALESCE(revoked_at,?) WHERE id=?',
        [now, input.rightId],
        db,
      );
      result = {
        ...result,
        action: 'revoke',
        rightId: input.rightId,
        revokedAt: right.revoked_at == null ? now : Number(right.revoked_at),
      };
    }
    await execute('UPDATE education_state SET revision=? WHERE id=1', [revision + 1], db);
    await execute(
      'INSERT INTO education_operations(operation_id,actor_id,request_json,result_json,created_at) VALUES (?,?,?,?,?)',
      [input.operationId, actor.actor, request, JSON.stringify(result), now],
      db,
    );
    return result;
  });
}
// Entitlement lookup for a trusted future authentication consumer, NOT a session guard.
// Never expose userId through HTTP without an authenticated principal.
export async function educationalEntitlement(userId: string, activityId: number): Promise<boolean> {
  z.string().uuid().parse(userId);
  id.parse(activityId);
  return peopleTransaction(async (db) => {
    await lockEducation(db);
    const links = await query(
      `SELECT l.person_id FROM education_person_links l
      JOIN identity_users u ON u.id=l.user_id AND u.status='enabled'
      JOIN people p ON p.id=l.person_id AND p.activo=1
      WHERE l.user_id=? AND l.enabled=1 FOR UPDATE`,
      [userId],
      db,
    );
    if (links.length !== 1) return false;
    const person = links[0].person_id;
    const [p] = await query(
      'SELECT enabled FROM education_presential WHERE person_id=? AND activity_id=? FOR UPDATE',
      [person, activityId],
      db,
    );
    const rights = await query(
      'SELECT starts_at,ends_at,revoked_at FROM education_digital_rights WHERE person_id=? AND activity_id=? FOR UPDATE',
      [person, activityId],
      db,
    );
    const [time] = await query(`SELECT ${clock} now_ms`, [], db);
    return hasEducationalAccess(
      Boolean(p?.enabled),
      rights.map((r) => ({
        starts_at: Number(r.starts_at),
        ends_at: Number(r.ends_at),
        revoked: r.revoked_at !== null,
      })),
      Number(time.now_ms),
    );
  });
}
