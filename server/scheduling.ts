import { query, execute, peopleTransaction, type Connection } from './db.js';
import { AppError, requireFound } from './errors.js';
import { periodSchema } from '../shared/domain.js';
import { scheduleConflict, type Booking } from '../shared/schedule.js';

export async function openPeriod(period: number, db: Connection) {
  const [p] = await query('SELECT * FROM periods WHERE id=? FOR UPDATE', [period], db);
  requireFound(p);
  if (p.status !== 'open')
    throw new AppError(409, 'El período está cerrado. Reabrilo para modificarlo.');
  return p;
}
export async function bookings(period: number, db: Connection, exclude = 0) {
  return query<Booking>(
    `SELECT e.id,e.person_id,e.activity_id,a.instructor_id,a.name activity,a.mode,s.day,s.start,s.end
    FROM enrollments e JOIN activities a ON a.id=e.activity_id JOIN enrollment_slots s ON s.enrollment_id=e.id
    WHERE e.period_id=? AND e.id<>?`,
    [period, exclude],
    db,
  );
}
export async function periodHasData(period: number, db: Connection) {
  const [r] = await query(
    `SELECT
    (SELECT COUNT(*) FROM enrollments WHERE period_id=?) +
    (SELECT COUNT(*) FROM monthly_accounts WHERE period_id=?) +
    (SELECT COUNT(*) FROM advertising_investments a JOIN periods p ON YEAR(a.date)=p.year AND MONTH(a.date)=p.month WHERE p.id=?) total`,
    [period, period, period],
    db,
  );
  return Number(r.total) > 0;
}
export async function periodEdit(period: number, body?: unknown) {
  return peopleTransaction(async (db) => {
    requireFound((await query('SELECT id FROM periods WHERE id=? FOR UPDATE', [period], db))[0]);
    if (await periodHasData(period, db))
      throw new AppError(409, 'El período tiene movimientos. Solo puede cerrarse o reabrirse.');
    if (body) {
      const p = periodSchema.parse(body);
      await execute('UPDATE periods SET year=?,month=? WHERE id=?', [p.year, p.month, period], db);
    } else await execute('DELETE FROM periods WHERE id=?', [period], db);
    return { ok: true };
  });
}
export async function validateActivityChange(
  id: number,
  instructor: number,
  mode: string,
  db: Connection,
) {
  const periods = await query(
    'SELECT DISTINCT period_id FROM enrollments WHERE activity_id=?',
    [id],
    db,
  );
  for (const p of periods) {
    const list = (await bookings(p.period_id, db)).map((b) =>
      b.activity_id === id ? { ...b, instructor_id: instructor, mode } : b,
    );
    for (let i = 0; i < list.length; i++) {
      if (list[i].activity_id !== id) continue;
      const conflict = scheduleConflict(
        list[i],
        list.filter((_, j) => j !== i),
      );
      if (conflict) throw new AppError(409, `La configuración generaría un conflicto: ${conflict}`);
    }
  }
}
export async function deleteMovement(kind: 'payments' | 'enrollments', id: number) {
  return peopleTransaction(async (db) => {
    const [r] = await query(
      kind === 'payments'
        ? 'SELECT m.period_id FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE p.id=?'
        : 'SELECT period_id FROM enrollments WHERE id=?',
      [id],
      db,
    );
    requireFound(r);
    await openPeriod(r.period_id, db);
    await execute(`DELETE FROM ${kind} WHERE id=?`, [id], db);
    return { ok: true };
  });
}
