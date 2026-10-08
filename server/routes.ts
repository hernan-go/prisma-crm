import { facilitators } from './facilitators.js';
import { offerings, instructorSave, deleteCatalog } from './offerings.js';
import { expenses } from './expenses.js';
import { formsImport } from './forms-import.js';
import { openPeriod, periodCreate, periodEdit, deleteMovement } from './scheduling.js';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { money, personSchema, normalizePhone, normalizeDni } from '../shared/domain.js';
import { query, execute, pool, peopleTransaction } from './db.js';
import { AppError, requireFound } from './errors.js';
import { accounts, enrollmentList, paymentSelect, duplicates, savePerson } from './repositories.js';
import { personSave, enrollmentSave, paymentSave, activitySave, positiveId } from './services.js';
import {
  membershipAdd,
  membershipList,
  membershipRemove,
  requireMembership,
} from './memberships.js';
import { readImport, guessMapping, mapRow, strongMatch } from './importer.js';
export const api = Router();
api.use(facilitators);
api.use('/forms-import', formsImport);
api.use(offerings);
api.use(expenses);
const id = (v: unknown) => positiveId.parse(v);
api.get('/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok' });
});
api.get('/people', async (req, res) => {
  const search = z
    .string()
    .max(200)
    .parse(req.query.q || '');
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .parse(req.query.page || 1);
  const active = req.query.archived === 'true' ? '' : 'AND activo=1';
  const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const phone = normalizePhone(search);
  const dni = normalizeDni(search);
  const where = `(CONCAT(nombre,' ',apellido) LIKE ? OR public_id LIKE ? OR telefono LIKE ? OR (?<>'' AND phone_normalized LIKE ?) OR dni LIKE ? OR (?<>'' AND UPPER(REGEXP_REPLACE(dni,'[^0-9A-Za-z]','')) LIKE ?) OR email LIKE ?) ${active}`;
  const args = [like, like, like, phone, `%${phone}%`, like, dni, `%${dni}%`, like];
  const [count] = await query(`SELECT COUNT(*) total FROM people WHERE ${where}`, args);
  const rows = await query(
    `SELECT * FROM people WHERE ${where} ORDER BY apellido,nombre LIMIT 40 OFFSET ${Math.min((page - 1) * 40, 1000000)}`,
    args,
  );
  res.json({ rows, total: count.total, page });
});
api.post('/people/matches', async (req, res) => {
  const p = z
    .object({
      telefono: z.string().max(60).default(''),
      dni: z.string().max(30).default(''),
      email: z.string().max(254).default(''),
      exclude: z.number().int().nonnegative().default(0),
    })
    .parse(req.body);
  const phone = normalizePhone(p.telefono);
  const dni = normalizeDni(p.dni);
  const rows = await query(
    "SELECT id,public_id,nombre,apellido,IF(phone_normalized=? AND ?<>'','mismo teléfono',IF(UPPER(REGEXP_REPLACE(dni,'[^0-9A-Za-z]',''))=? AND ?<>'','mismo DNI','mismo email')) reason FROM people WHERE id<>? AND ((?<>'' AND phone_normalized=?) OR (?<>'' AND UPPER(REGEXP_REPLACE(dni,'[^0-9A-Za-z]',''))=?) OR (?<>'' AND email=?)) LIMIT 20",
    [phone, phone, dni, dni, p.exclude, phone, phone, dni, dni, p.email, p.email],
  );
  res.json(rows);
});
api.post('/people', async (req, res) => res.status(201).json(await personSave(req.body)));
api.put('/people/:id', async (req, res) => res.json(await personSave(req.body, id(req.params.id))));
api.delete('/people/:id', async (req, res) => {
  const r = await execute('UPDATE people SET activo=0 WHERE id=?', [id(req.params.id)]);
  requireFound(r.affectedRows);
  res.json({ ok: true });
});
api.get('/people/:id', async (req, res) => {
  const pid = id(req.params.id);
  const [p] = await query('SELECT * FROM people WHERE id=?', [pid]);
  requireFound(p);
  const history = await enrollmentList(undefined, pid);
  const payments = await query(
    `${paymentSelect} WHERE m.person_id=? ORDER BY p.date DESC,p.id DESC`,
    [pid],
  );
  const monthly = await query(
    'SELECT m.*,pr.year,pr.month,COALESCE(SUM(p.amount),0) paid,IF(m.amount_due IS NULL,NULL,m.amount_due-COALESCE(SUM(p.amount),0)) balance FROM monthly_accounts m JOIN periods pr ON pr.id=m.period_id LEFT JOIN payments p ON p.account_id=m.id WHERE m.person_id=? GROUP BY m.id,pr.id ORDER BY pr.year DESC,pr.month DESC',
    [pid],
  );
  res.json({ ...p, history, payments, accounts: monthly });
});
api.get('/periods/:periodId/memberships', async (req, res) =>
  res.json(
    await membershipList(
      id(req.params.periodId),
      req.query.person_id ? id(req.query.person_id) : undefined,
    ),
  ),
);
api.post('/periods/:periodId/memberships', async (req, res) => {
  const p = z.object({ person_id: positiveId }).strict().parse(req.body);
  res.status(201).json(await membershipAdd(p.person_id, id(req.params.periodId)));
});
api.delete('/periods/:periodId/memberships/:id', async (req, res) =>
  res.json(await membershipRemove(id(req.params.id), id(req.params.periodId))),
);
api.get('/periods', async (_req, res) =>
  res.json(await query('SELECT * FROM periods ORDER BY year DESC,month DESC')),
);
api.post('/periods', async (req, res) => {
  res.status(201).json(await periodCreate(req.body));
});
api.put('/periods/:id', async (req, res) =>
  res.json(await periodEdit(id(req.params.id), req.body)),
);
api.delete('/periods/:id', async (req, res) => res.json(await periodEdit(id(req.params.id))));
api.patch('/periods/:id/status', async (req, res) => {
  const status = z.enum(['open', 'closed']).parse(req.body.status);
  await peopleTransaction(async (db) => {
    requireFound(
      (await execute('UPDATE periods SET status=? WHERE id=?', [status, id(req.params.id)], db))
        .affectedRows,
    );
  });
  res.json({ ok: true });
});
api.get('/instructors', async (_req, res) =>
  res.json(await query('SELECT * FROM instructors ORDER BY name')),
);
api.post('/instructors', async (req, res) => res.status(201).json(await instructorSave(req.body)));
api.put('/instructors/:id', async (req, res) =>
  res.json(await instructorSave(req.body, id(req.params.id))),
);
api.delete('/instructors/:id', async (req, res) =>
  res.json(await deleteCatalog('instructors', id(req.params.id))),
);
api.delete('/activities/:id', async (req, res) =>
  res.json(await deleteCatalog('activities', id(req.params.id))),
);
api.get('/activities', async (_req, res) => {
  const rows = await query('SELECT id,name,mode,active,ever_used FROM activities ORDER BY name');
  const days = await query('SELECT * FROM activity_allowed_days');
  res.json(
    rows.map((a) => ({ ...a, days: days.filter((d) => d.activity_id === a.id).map((d) => d.day) })),
  );
});
api.post('/activities', async (req, res) => res.status(201).json(await activitySave(req.body)));
api.put('/activities/:id', async (req, res) =>
  res.json(await activitySave(req.body, id(req.params.id))),
);
api.get('/enrollments', async (req, res) =>
  res.json(
    await enrollmentList(
      id(req.query.period_id),
      req.query.person_id ? id(req.query.person_id) : undefined,
    ),
  ),
);
api.post('/enrollments', async (req, res) => res.status(201).json(await enrollmentSave(req.body)));
api.put('/enrollments/:id', async (req, res) =>
  res.json(await enrollmentSave(req.body, id(req.params.id))),
);
api.delete('/enrollments/:id', async (req, res) =>
  res.json(await deleteMovement('enrollments', id(req.params.id), id(req.query.period_id))),
);
api.get('/accounts', async (req, res) =>
  res.json(
    await accounts(
      id(req.query.period_id),
      req.query.person_id ? id(req.query.person_id) : undefined,
    ),
  ),
);
api.put('/accounts', async (req, res) => {
  const p = z
    .object({ person_id: positiveId, period_id: positiveId, amount_due: money.nullable() })
    .parse(req.body);
  await peopleTransaction(async (db) => {
    await openPeriod(p.period_id, db);
    await requireMembership(p.person_id, p.period_id, db);
    await execute(
      'INSERT INTO monthly_accounts(person_id,period_id,amount_due) VALUES (?,?,?) ON DUPLICATE KEY UPDATE amount_due=VALUES(amount_due)',
      [p.person_id, p.period_id, p.amount_due],
      db,
    );
  });
  res.json({ ok: true });
});
api.get('/payments', async (req, res) =>
  res.json(
    await query(`${paymentSelect} WHERE m.period_id=? ORDER BY p.date DESC,p.id DESC`, [
      id(req.query.period_id),
    ]),
  ),
);
api.post('/payments', async (req, res) => res.status(201).json(await paymentSave(req.body)));
api.put('/payments/:id', async (req, res) =>
  res.json(await paymentSave(req.body, id(req.params.id))),
);
api.delete('/payments/:id', async (req, res) =>
  res.json(await deleteMovement('payments', id(req.params.id), id(req.query.period_id))),
);
api.get('/dashboard', async (req, res) => {
  const period = id(req.query.period_id);
  const [enrollment] = await query(
    'SELECT (SELECT COUNT(*) FROM enrollments WHERE period_id=?) enrollments,(SELECT COUNT(*) FROM period_memberships WHERE period_id=?) people',
    [period, period],
  );
  const [totals] = await query(
    'SELECT COALESCE(SUM(amount_due),0) due,SUM(amount_due IS NULL) undefined_accounts FROM monthly_accounts WHERE period_id=?',
    [period],
  );
  const [paymentTotals] = await query(
    `SELECT
      COALESCE(SUM(p.amount),0) paid,
      COALESCE(SUM(IF(p.method='cash',p.amount,0)),0) cash,
      COALESCE(SUM(IF(p.method='transfer',p.amount,0)),0) transfer,
      COALESCE(SUM(CASE WHEN p.recipient='jesica' AND p.method='cash' THEN p.amount ELSE 0 END),0) jesica_cash,
      COALESCE(SUM(CASE WHEN p.recipient='jesica' AND p.method='transfer' THEN p.amount ELSE 0 END),0) jesica_transfer,
      COALESCE(SUM(CASE WHEN p.recipient='hernan' AND p.method='cash' THEN p.amount ELSE 0 END),0) hernan_cash,
      COALESCE(SUM(CASE WHEN p.recipient='hernan' AND p.method='transfer' THEN p.amount ELSE 0 END),0) hernan_transfer,
      COALESCE(SUM(CASE WHEN p.recipient='jesica' THEN p.amount ELSE 0 END),0) jesica_total,
      COALESCE(SUM(CASE WHEN p.recipient='hernan' THEN p.amount ELSE 0 END),0) hernan_total
     FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE m.period_id=?`,
    [period],
  );
  const paid = {
    paid: paymentTotals.paid,
    cash: paymentTotals.cash,
    transfer: paymentTotals.transfer,
  };
  const wallets = {
    jesica: {
      cash: paymentTotals.jesica_cash,
      transfer: paymentTotals.jesica_transfer,
      total: paymentTotals.jesica_total,
    },
    hernan: {
      cash: paymentTotals.hernan_cash,
      transfer: paymentTotals.hernan_transfer,
      total: paymentTotals.hernan_total,
    },
  };
  const [pending] = await query(
    'SELECT COALESCE(SUM(GREATEST(amount_due-paid,0)),0) pending,COALESCE(SUM(GREATEST(paid-amount_due,0)),0) credit FROM (SELECT m.amount_due,COALESCE(SUM(p.amount),0) paid FROM monthly_accounts m LEFT JOIN payments p ON p.account_id=m.id WHERE m.period_id=? GROUP BY m.id) balances',
    [period],
  );
  const activities = await query(
    'SELECT o.name,COUNT(DISTINCT e.person_id) count FROM period_activities o LEFT JOIN enrollments e ON e.activity_id=o.activity_id AND e.period_id=o.period_id WHERE o.period_id=? GROUP BY o.id ORDER BY count DESC,o.name',
    [period],
  );
  res.json({ ...enrollment, ...totals, ...paid, ...pending, activities, wallets });
});
api.all(['/advertising', '/advertising/:id'], (_req, res) => {
  res
    .status(410)
    .json({ message: 'La inversión publicitaria ahora se administra desde Gastos Período.' });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
api.post('/import/preview', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError(422, 'Falta seleccionar el archivo.');
  const row = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(req.body.headerRow || 1);
  const result = await readImport(req.file.buffer, req.file.originalname, req.body.sheet, row);
  const mapping = req.body.mapping
    ? z.record(z.string(), z.number().int().min(-1).max(99)).parse(JSON.parse(req.body.mapping))
    : guessMapping(result.headers);
  let discarded = 0;
  const rows: any[] = [];
  for (const source of result.rows) {
    const mapped = mapRow(source.values, mapping);
    if (!mapped.person.nombre && !mapped.person.apellido && !mapped.person.telefono) {
      discarded++;
      continue;
    }
    const matches = mapped.valid ? await duplicates(personSchema.parse(mapped.person), pool) : [];
    const duplicate_lines = mapped.valid
      ? rows
          .filter(
            (r) =>
              r.valid &&
              strongMatch(personSchema.parse(r.person), personSchema.parse(mapped.person)),
          )
          .map((r) => r.line)
      : [];
    rows.push({
      ...source,
      ...mapped,
      matches,
      duplicate_lines,
      action: matches.length || duplicate_lines.length ? 'skip' : 'create',
    });
  }
  res.json({ ...result, rows, mapping, discarded });
});
api.post('/import/commit', async (req, res) => {
  const rows = z
    .array(
      z.object({
        person: z.unknown(),
        action: z.enum(['skip', 'create', 'update', 'force']),
        target_id: positiveId.optional(),
        reviewed: z.literal(true),
      }),
    )
    .max(10000)
    .parse(req.body.rows);
  const result = await peopleTransaction(async (db) => {
    let created = 0,
      updated = 0,
      skipped = 0;
    for (const row of rows) {
      if (row.action === 'skip') {
        skipped++;
        continue;
      }
      const person = personSchema.parse(row.person);
      const matches = await duplicates(person, db);
      if (row.action === 'update') {
        if (!row.target_id || !matches.some((m) => m.id === row.target_id))
          throw new AppError(
            409,
            'La persona a actualizar debe coincidir con un duplicado detectado.',
          );
        const [existing] = await query('SELECT * FROM people WHERE id=?', [row.target_id], db);
        await savePerson(
          {
            ...person,
            activo: !!existing.activo,
            emergency_name: existing.emergency_name,
            emergency_relationship: existing.emergency_relationship,
            emergency_phone: existing.emergency_phone,
            emergency_notes: existing.emergency_notes,
          },
          db,
          row.target_id,
        );
        updated++;
      } else {
        if (matches.length && row.action !== 'force')
          throw new AppError(
            409,
            'Apareció un posible duplicado. Actualizá la vista previa o elegí crear igualmente.',
          );
        await savePerson(person, db);
        created++;
      }
    }
    return { created, updated, skipped };
  });
  res.json(result);
});
