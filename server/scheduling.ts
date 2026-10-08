import { query, execute, peopleTransaction, type Connection } from './db.js';
import { AppError, requireFound } from './errors.js';
import { periodCreateSchema, periodSchema } from '../shared/domain.js';
import { type Booking } from '../shared/schedule.js';
import { scheduleList } from './offerings.js';
import { deletePeriodConfiguration } from './configuration-deletion.js';

export async function periodCreate(body: unknown) {
  const p = periodCreateSchema.parse(body);
  return peopleTransaction(async (db) => {
    const [source] =
      p.mode === 'clone_previous'
        ? await query(
            'SELECT id FROM periods WHERE year<? OR (year=? AND month<?) ORDER BY year DESC,month DESC LIMIT 1 FOR UPDATE',
            [p.year, p.year, p.month],
            db,
          )
        : [];
    if (p.mode === 'clone_previous' && !source)
      throw new AppError(409, 'No existe un período anterior del que copiar configuración.');
    const id = (
      await execute('INSERT INTO periods(year,month) VALUES (?,?)', [p.year, p.month], db)
    ).insertId;
    if (source) {
      // Read period configuration, never catalog defaults or transactional history.
      const offerings = await query(
        'SELECT id,activity_id,name,mode,active FROM period_activities WHERE period_id=? ORDER BY id',
        [source.id],
        db,
      );
      for (const offering of offerings) {
        const offeringId = (
          await execute(
            'INSERT INTO period_activities(period_id,activity_id,name,mode,active,ever_used) VALUES (?,?,?,?,?,0)',
            [id, offering.activity_id, offering.name, offering.mode, offering.active],
            db,
          )
        ).insertId;
        await execute(
          'INSERT INTO period_activity_days(offering_id,day) SELECT ?,day FROM period_activity_days WHERE offering_id=?',
          [offeringId, offering.id],
          db,
        );
        const schedules = await query(
          'SELECT id,day,start,end,active FROM activity_schedules WHERE offering_id=? ORDER BY id',
          [offering.id],
          db,
        );
        for (const schedule of schedules) {
          const scheduleId = (
            await execute(
              'INSERT INTO activity_schedules(offering_id,day,start,end,active,ever_used) VALUES (?,?,?,?,?,0)',
              [offeringId, schedule.day, schedule.start, schedule.end, schedule.active],
              db,
            )
          ).insertId;
          await execute(
            'INSERT INTO schedule_instructors(schedule_id,instructor_id,display_name) SELECT ?,instructor_id,display_name FROM schedule_instructors WHERE schedule_id=?',
            [scheduleId, schedule.id],
            db,
          );
        }
      }
    }
    return { id };
  });
}

export async function openPeriod(period: number, db: Connection) {
  const [p] = await query('SELECT * FROM periods WHERE id=? FOR UPDATE', [period], db);
  requireFound(p);
  if (p.status !== 'open')
    throw new AppError(409, 'El período está cerrado. Reabrilo para modificarlo.');
  return p;
}
export async function bookings(period: number, db: Connection, exclude = 0) {
  const schedules = await scheduleList(period, db);
  const rows = await query<{ id: number; person_id: number; schedule_id: number }>(
    'SELECT e.id,e.person_id,s.schedule_id FROM enrollments e JOIN enrollment_slots s ON s.enrollment_id=e.id WHERE e.period_id=? AND e.id<>?',
    [period, exclude],
    db,
  );
  return rows.map((r) => {
    const s = schedules.find((s) => s.id === r.schedule_id)!;
    return { ...s, ...r, instructor_ids: s.instructors.map((i: any) => i.id) } as Booking;
  });
}
export async function periodHasConfigurationOrData(period: number, db: Connection) {
  const [r] = await query(
    `SELECT
    (SELECT COUNT(*) FROM period_activities WHERE period_id=?) +
    (SELECT COUNT(*) FROM enrollments WHERE period_id=?) +
    (SELECT COUNT(*) FROM monthly_accounts WHERE period_id=?) +
    (SELECT COUNT(*) FROM period_memberships WHERE period_id=?) +
    (SELECT COUNT(*) FROM period_expense_categories WHERE period_id=?) total`,
    [period, period, period, period, period],
    db,
  );
  return Number(r.total) > 0;
}
export async function periodEdit(period: number, body?: unknown) {
  return peopleTransaction(async (db) => {
    if (body === undefined) {
      await deletePeriodConfiguration(period, db);
    } else {
      await openPeriod(period, db);
      if (await periodHasConfigurationOrData(period, db))
        throw new AppError(
          409,
          'Solo puede editarse la fecha de un período sin configuración ni datos.',
        );
      const p = periodSchema.parse(body);
      await execute('UPDATE periods SET year=?,month=? WHERE id=?', [p.year, p.month, period], db);
    }
    return { ok: true };
  });
}
export async function deleteMovement(kind: 'payments' | 'enrollments', id: number, period: number) {
  return peopleTransaction(async (db) => {
    const [r] = await query(
      kind === 'payments'
        ? 'SELECT m.period_id FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE p.id=?'
        : 'SELECT period_id FROM enrollments WHERE id=?',
      [id],
      db,
    );
    requireFound(r);
    if (r.period_id !== period)
      throw new AppError(409, 'El registro no corresponde al período seleccionado.');
    await openPeriod(r.period_id, db);
    await execute(`DELETE FROM ${kind} WHERE id=?`, [id], db);
    return { ok: true };
  });
}
