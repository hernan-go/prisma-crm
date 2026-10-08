import { createHash } from 'node:crypto';
import { query, execute, peopleTransaction, type Connection } from './db.js';
import { z } from 'zod';
import { AppError } from './errors.js';
import { deleteCatalogInDB } from './configuration-deletion.js';
const personNames = [
  'QA Ficticia Noviembre',
  'Ficticia Importada CSV',
  'Ficticia Importada XLSX',
  'Marta Ficticia',
  'Prueba Marta Ficticia',
  'Juan Test',
  'Importada CSV Ficticia',
  'Importada XLSX Ficticia',
  'Marta Ficticia Prueba',
];
const names: Record<string, string[]> = {
  people: personNames,
  activities: ['Actividad ficticia QA'],
  instructors: ['Docente ficticio QA'],
};
const tables = ['people', 'activities', 'instructors', 'advertising_investments'] as const;
type Table = (typeof tables)[number];
async function snapshot(table: Table, id: number, db: Connection) {
  const rows = await query(`SELECT * FROM ${table} WHERE id=?`, [id], db);
  if (!rows.length) throw new AppError(409, 'Un candidato ya no existe. Regenerá el plan.');
  const related: Record<string, unknown> = {};
  if (table === 'people') {
    related.memberships = await query(
      'SELECT * FROM period_memberships WHERE person_id=? ORDER BY id',
      [id],
      db,
    );
    related.enrollments = await query(
      'SELECT * FROM enrollments WHERE person_id=? ORDER BY id',
      [id],
      db,
    );
    related.slots = await query(
      'SELECT s.* FROM enrollment_slots s JOIN enrollments e ON e.id=s.enrollment_id WHERE e.person_id=? ORDER BY s.id',
      [id],
      db,
    );
    related.accounts = await query(
      'SELECT * FROM monthly_accounts WHERE person_id=? ORDER BY id',
      [id],
      db,
    );
    related.payments = await query(
      'SELECT p.* FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE m.person_id=? ORDER BY p.id',
      [id],
      db,
    );
  }
  if (table === 'activities') {
    related.offerings = await query(
      'SELECT * FROM period_activities WHERE activity_id=? ORDER BY id',
      [id],
      db,
    );
    related.days = await query(
      'SELECT * FROM activity_allowed_days WHERE activity_id=? ORDER BY day',
      [id],
      db,
    );
    related.enrollments = await query(
      'SELECT * FROM enrollments WHERE activity_id=? ORDER BY id',
      [id],
      db,
    );
  }
  if (table === 'instructors') {
    related.schedules = await query(
      'SELECT * FROM schedule_instructors WHERE instructor_id=? ORDER BY schedule_id',
      [id],
      db,
    );
    related.activities = await query(
      'SELECT * FROM activities WHERE instructor_id=? ORDER BY id',
      [id],
      db,
    );
  }
  return { record: rows[0], related };
}
const fingerprint = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function cleanupPlan() {
  return peopleTransaction(async (db) => {
    const [base] = await query('SELECT DATABASE() name', [], db);
    const candidates = [];
    for (const table of tables) {
      const list =
        table === 'advertising_investments'
          ? await query(
              "SELECT id FROM advertising_investments WHERE concept LIKE '%fictici%' OR concept LIKE '% QA%'",
              [],
              db,
            )
          : await query(
              `SELECT id FROM ${table} WHERE ${table === 'people' ? "CONCAT(nombre,' ',apellido)" : 'name'} IN (${names[table].map(() => '?')})`,
              names[table],
              db,
            );
      for (const r of list) {
        const data = await snapshot(table, r.id, db);
        candidates.push({
          table,
          id: r.id,
          reviewed: false,
          fingerprint: fingerprint(data),
          ...data,
        });
      }
    }
    return { database: base.name, created_at: new Date().toISOString(), candidates };
  });
}
export async function applyCleanup(input: unknown, database: string) {
  const plan = z
    .object({
      database: z.string(),
      candidates: z.array(
        z.object({
          table: z.enum(tables),
          id: z.number().int().positive(),
          reviewed: z.boolean(),
          fingerprint: z.string().length(64),
        }),
      ),
    })
    .parse(input);
  if (plan.database !== database)
    throw new AppError(422, 'La base confirmada no coincide con el plan.');
  return peopleTransaction(async (db) => {
    const [base] = await query('SELECT DATABASE() name', [], db);
    if (base.name !== database)
      throw new AppError(422, 'La conexión no coincide con la base confirmada.');
    const chosen = plan.candidates.filter((c) => c.reviewed);
    for (const c of chosen) {
      const data = await snapshot(c.table, c.id, db);
      if (c.table === 'people' && (data.related.memberships as unknown[]).length)
        throw new AppError(
          409,
          'La persona tiene pertenencia a períodos. La limpieza QA no elimina membresías ni su historial.',
        );
      if (fingerprint(data) !== c.fingerprint)
        throw new AppError(409, 'Los datos cambiaron desde la revisión. Regenerá el plan.');
      const label =
        c.table === 'people' ? `${data.record.nombre} ${data.record.apellido}` : data.record.name;
      if (c.table !== 'advertising_investments' && !names[c.table].includes(label))
        throw new AppError(422, 'Registro fuera de la lista QA permitida.');
      if (c.table === 'advertising_investments' && !/fictici| QA/i.test(data.record.concept))
        throw new AppError(422, 'Publicidad fuera de los candidatos QA.');
    }
    for (const c of [...chosen].sort((a, b) => tables.indexOf(a.table) - tables.indexOf(b.table))) {
      if (c.table === 'people') {
        await execute(
          'DELETE p FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE m.person_id=?',
          [c.id],
          db,
        );
        await execute('DELETE FROM monthly_accounts WHERE person_id=?', [c.id], db);
        await execute('DELETE FROM enrollments WHERE person_id=?', [c.id], db);
      }
      if (c.table === 'activities' || c.table === 'instructors') {
        await deleteCatalogInDB(c.table, c.id, db);
        continue;
      }
      await execute(`DELETE FROM ${c.table} WHERE id=?`, [c.id], db);
    }
    return { deleted: chosen.length };
  });
}
