import { Router } from 'express';
import { z } from 'zod';
import { peopleTransaction, query } from './db.js';
import { AppError } from './errors.js';
import {
  authorizeEducation,
  lockEducation,
  educationCommand,
  mutateEducation,
  quarterEnd,
} from './education-access.js';
import {
  commercialDate,
  type EducationSnapshot,
  type EducationReceipt,
} from '../shared/education.js';

const personId = z.coerce.number().int().positive();
const pageSchema = z.coerce.number().int().min(1).max(25000).default(1);
const json = (value: any) => (typeof value === 'string' ? JSON.parse(value) : value);
function receipt(row: any): EducationReceipt {
  const input = json(row.request_json).input;
  return {
    operationId: row.operation_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    createdAt: Number(row.created_at),
    kind: input.kind,
    reason: input.reason,
    activityId: input.activityId,
    rightId: input.rightId,
    verificationReference: input.verificationReference,
    userId: input.userId,
    paymentDeclared: input.paymentVerified === true,
    accountedPayment: false,
    result: json(row.result_json),
  };
}
const receiptSelect = `SELECT o.operation_id,o.actor_id,u.display_name actor_name,o.request_json,o.result_json,o.created_at
 FROM education_operations o JOIN identity_users u ON u.id=o.actor_id`;

// Every read shares the mutation lock order and revalidates the persistent CRM authority.
export async function readEducation(
  adminToken: string,
  request:
    | { kind: 'search'; search: string }
    | { kind: 'person'; personId: number }
    | { kind: 'history'; personId: number; page: number }
    | { kind: 'receipt'; operationId: string }
    | { kind: 'identities'; search: string },
) {
  return peopleTransaction(async (db) => {
    const revision = await lockEducation(db);
    await authorizeEducation(db, adminToken);
    if (request.kind === 'identities') {
      const search = z.string().trim().min(2).max(100).parse(request.search);
      const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      return query(
        `SELECT u.id userId,u.display_name displayName,u.status,l.person_id personId,l.enabled
        FROM identity_users u JOIN identity_user_roles r ON r.user_id=u.id AND r.role='participant'
        LEFT JOIN education_person_links l ON l.user_id=u.id
        WHERE (u.id LIKE ? OR u.display_name LIKE ?)
        AND NOT EXISTS (SELECT 1 FROM identity_user_roles x WHERE x.user_id=u.id AND x.role IN ('admin','facilitator'))
        AND NOT EXISTS (SELECT 1 FROM identity_instructor_links p WHERE p.user_id=u.id)
        AND NOT EXISTS (SELECT 1 FROM identity_institution i WHERE i.admin_one=u.id OR i.admin_two=u.id)
        ORDER BY u.display_name,u.id LIMIT 40`,
        [like, like],
        db,
      );
    }
    if (request.kind === 'search') {
      const search = z.string().trim().min(2).max(100).parse(request.search);
      const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      return query(
        `SELECT id,public_id,nombre,apellido,activo FROM people
        WHERE CONCAT(nombre,' ',apellido) LIKE ? OR public_id LIKE ? ORDER BY apellido,nombre,id LIMIT 40`,
        [like, like],
        db,
      );
    }
    if (request.kind === 'receipt') {
      z.string().uuid().parse(request.operationId);
      const [row] = await query(
        `${receiptSelect} WHERE o.operation_id=?`,
        [request.operationId],
        db,
      );
      if (!row) throw new AppError(404, 'Recibo inexistente.');
      return receipt(row);
    }
    const pid = personId.parse(request.personId);
    const [person] = await query(
      'SELECT id,public_id,nombre,apellido,activo FROM people WHERE id=?',
      [pid],
      db,
    );
    if (!person) throw new AppError(404, 'Persona inexistente.');
    if (request.kind === 'history') {
      const page = pageSchema.parse(request.page);
      const rows = await query(
        `${receiptSelect}
        LEFT JOIN education_digital_rights d ON d.id=JSON_UNQUOTE(JSON_EXTRACT(o.request_json,'$.input.rightId'))
        WHERE JSON_EXTRACT(o.request_json,'$.input.personId')=? OR d.person_id=?
        ORDER BY o.created_at DESC,o.operation_id DESC LIMIT 41 OFFSET ${(page - 1) * 40}`,
        [pid, pid],
        db,
      );
      return { rows: rows.slice(0, 40).map(receipt), page, hasMore: rows.length > 40 };
    }
    const [time] = await query(
      'SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) now_ms',
      [],
      db,
    );
    const now = Number(time.now_ms);
    const activities = await query(
      'SELECT id,name,active FROM activities ORDER BY name,id',
      [],
      db,
    );
    const presential = await query(
      `SELECT p.activity_id activityId,a.name activity,p.enabled
      FROM education_presential p JOIN activities a ON a.id=p.activity_id WHERE p.person_id=?`,
      [pid],
      db,
    );
    const enrollments = await query(
      `SELECT DISTINCT a.name activity,p.year,p.month FROM enrollments e
      JOIN activities a ON a.id=e.activity_id JOIN periods p ON p.id=e.period_id WHERE e.person_id=? ORDER BY p.year DESC,p.month DESC,a.name`,
      [pid],
      db,
    );
    const rights = await query(
      `SELECT d.*,a.name activity FROM education_digital_rights d
      JOIN activities a ON a.id=d.activity_id WHERE d.person_id=? ORDER BY d.starts_at DESC,d.id`,
      [pid],
      db,
    );
    const [participantLink] = await query(
      `SELECT l.user_id userId,l.enabled,u.display_name displayName,u.status
      FROM education_person_links l JOIN identity_users u ON u.id=l.user_id WHERE l.person_id=?`,
      [pid],
      db,
    );
    return {
      revision,
      now,
      person,
      activities,
      presential,
      enrollments,
      participantLink: participantLink ?? null,
      rights: rights.map((r) => ({
        id: r.id,
        activityId: r.activity_id,
        activity: r.activity,
        startsAt: Number(r.starts_at),
        endsAt: Number(r.ends_at),
        revokedAt: r.revoked_at === null ? null : Number(r.revoked_at),
        status:
          r.revoked_at !== null
            ? 'revoked'
            : now < Number(r.starts_at)
              ? 'scheduled'
              : now >= Number(r.ends_at)
                ? 'expired'
                : 'active',
      })),
    };
  });
}
export async function previewDigital(token: string, raw: unknown) {
  const input = z.object({ personId, activityId: personId }).strict().parse(raw);
  const snapshot = (await readEducation(token, {
    kind: 'person',
    personId: input.personId,
  })) as EducationSnapshot;
  if (!snapshot.person.activo) throw new AppError(409, 'Persona no habilitada.');
  const activity = snapshot.activities.find((a) => a.id === input.activityId);
  if (!activity) throw new AppError(404, 'Actividad inexistente.');
  const ends = snapshot.rights
    .filter((r) => r.activityId === input.activityId && r.revokedAt === null)
    .map((r) => r.endsAt);
  const previousEnd = ends.length ? Math.max(...ends) : null;
  const startsAt = Math.max(snapshot.now, previousEnd ?? 0),
    endsAt = quarterEnd(startsAt);
  return {
    revision: snapshot.revision,
    person: snapshot.person,
    activity,
    previousEnd,
    startsAt,
    endsAt,
    expectedWindow: { startDate: commercialDate(startsAt), endDate: commercialDate(endsAt) },
  };
}

export const educationAdmin = Router();
educationAdmin.use((req, res, next) => {
  const principal = res.locals.principal;
  if (principal?.kind !== 'identity' || !principal.roles.includes('admin'))
    throw new AppError(403, 'Requiere sesión Google administrativa individual.');
  const name = process.env.NODE_ENV === 'production' ? '__Host-prisma_identity' : 'prisma_identity';
  const cookies = (req.headers.cookie ?? '')
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith(name + '='));
  if (cookies.length !== 1) throw new AppError(401, 'Sesión individual inválida.');
  res.locals.educationToken = cookies[0].slice(name.length + 1);
  next();
});
educationAdmin.get('/people', async (req, res) =>
  res.json(
    await readEducation(res.locals.educationToken, {
      kind: 'search',
      search: z.string().parse(req.query.q),
    }),
  ),
);
educationAdmin.get('/identities', async (req, res) =>
  res.json(
    await readEducation(res.locals.educationToken, {
      kind: 'identities',
      search: z.string().parse(req.query.q),
    }),
  ),
);
educationAdmin.get('/people/:id', async (req, res) =>
  res.json(
    await readEducation(res.locals.educationToken, {
      kind: 'person',
      personId: personId.parse(req.params.id),
    }),
  ),
);
educationAdmin.get('/people/:id/history', async (req, res) =>
  res.json(
    await readEducation(res.locals.educationToken, {
      kind: 'history',
      personId: personId.parse(req.params.id),
      page: pageSchema.parse(req.query.page),
    }),
  ),
);
educationAdmin.get('/operations/:id', async (req, res) =>
  res.json(
    await readEducation(res.locals.educationToken, {
      kind: 'receipt',
      operationId: z.string().uuid().parse(req.params.id),
    }),
  ),
);
educationAdmin.post('/preview', async (req, res) =>
  res.json(await previewDigital(res.locals.educationToken, req.body)),
);
educationAdmin.post('/operations', async (req, res) => {
  const input = educationCommand.parse(req.body);
  if (input.kind === 'link' && !input.associationConfirmed)
    throw new AppError(
      422,
      'Confirmá expresamente la asociación administrativa; no acredita titularidad.',
    );
  if (input.kind === 'digital' && !input.expectedWindow)
    throw new AppError(422, 'Revisá las fechas antes de confirmar.');
  res.json(await mutateEducation(res.locals.educationToken, input));
});
