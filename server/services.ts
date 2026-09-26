import { openPeriod, bookings, validateActivityChange } from './scheduling.js';
import { scheduleConflict, type Booking } from '../shared/schedule.js';
import { z } from 'zod';
import {
  activitySchema,
  enrollmentSchema,
  personSchema,
  paymentSchema,
  validateDays,
} from '../shared/domain.js';
import { query, execute, peopleTransaction, type Connection } from './db.js';
import { duplicates, savePerson } from './repositories.js';
import { AppError, requireFound } from './errors.js';
export async function personSave(body: unknown, id?: number) {
  const p = personSchema.parse(body);
  return peopleTransaction(async (db) => {
    if (id) requireFound((await query('SELECT id FROM people WHERE id=? FOR UPDATE', [id], db))[0]);
    const dup = await duplicates(p, db, id);
    if (dup.length && (body as any).allow_duplicate !== true)
      throw new AppError(
        409,
        'Posible duplicado. Revisá las coincidencias antes de crear igualmente.',
        dup,
      );
    return { id: await savePerson(p, db, id) };
  });
}
export async function enrollmentSave(body: unknown, id?: number) {
  const p = enrollmentSchema.parse(body);
  return peopleTransaction((db) => enrollmentInDB(p, db, id));
}
export async function enrollmentInDB(body: unknown, db: Connection, id?: number) {
  const p = enrollmentSchema.parse(body);
  if (id) {
    const [old] = await query('SELECT period_id FROM enrollments WHERE id=? FOR UPDATE', [id], db);
    requireFound(old);
    await openPeriod(old.period_id, db);
  }
  requireFound(
    (await query('SELECT id FROM people WHERE id=? AND activo=1', [p.person_id], db))[0],
  );
  await openPeriod(p.period_id, db);
  const [activity] = await query(
    'SELECT a.* FROM activities a JOIN instructors i ON i.id=a.instructor_id WHERE a.id=? AND a.active=1 AND i.active=1 FOR UPDATE',
    [p.activity_id],
    db,
  );
  requireFound(activity);
  const allowed = (
    await query('SELECT day FROM activity_allowed_days WHERE activity_id=?', [p.activity_id], db)
  ).map((r) => r.day);
  if (!validateDays(p.slots, allowed))
    throw new AppError(422, 'Hay un día no permitido para esta actividad.');
  const existing = await bookings(p.period_id, db, id);
  const proposed: Booking[] = [];
  for (const slot of p.slots) {
    const next = {
      ...slot,
      person_id: p.person_id,
      activity_id: p.activity_id,
      instructor_id: activity.instructor_id,
      activity: activity.name,
      mode: activity.mode,
    };
    const conflict = scheduleConflict(next, [...existing, ...proposed]);
    if (conflict) throw new AppError(409, conflict);
    proposed.push(next);
  }
  let eid = id;
  if (eid) {
    await execute(
      'UPDATE enrollments SET person_id=?,period_id=?,activity_id=? WHERE id=?',
      [p.person_id, p.period_id, p.activity_id, eid],
      db,
    );
    await execute('DELETE FROM enrollment_slots WHERE enrollment_id=?', [eid], db);
  } else {
    eid = (
      await execute(
        'INSERT INTO enrollments(person_id,period_id,activity_id) VALUES (?,?,?)',
        [p.person_id, p.period_id, p.activity_id],
        db,
      )
    ).insertId;
  }
  for (const s of p.slots)
    await execute(
      'INSERT INTO enrollment_slots(enrollment_id,day,start,end) VALUES (?,?,?,?)',
      [eid, s.day, s.start, s.end],
      db,
    );
  await execute(
    'INSERT IGNORE INTO monthly_accounts(person_id,period_id) VALUES (?,?)',
    [p.person_id, p.period_id],
    db,
  );
  return { id: eid };
}
export async function paymentSave(body: unknown, id?: number) {
  const p = paymentSchema.parse(body);
  return peopleTransaction(async (db) => {
    await openPeriod(p.period_id, db);
    if (id) {
      const [old] = await query(
        'SELECT m.period_id FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE p.id=?',
        [id],
        db,
      );
      requireFound(old);
      await openPeriod(old.period_id, db);
    }
    await execute(
      'INSERT IGNORE INTO monthly_accounts(person_id,period_id) VALUES (?,?)',
      [p.person_id, p.period_id],
      db,
    );
    const [account] = await query(
      'SELECT id FROM monthly_accounts WHERE person_id=? AND period_id=? FOR UPDATE',
      [p.person_id, p.period_id],
      db,
    );
    if (id)
      await execute(
        'UPDATE payments SET account_id=?,date=?,amount=?,method=?,notes=? WHERE id=?',
        [account.id, p.date, p.amount, p.method, p.notes, id],
        db,
      );
    else
      id = (
        await execute(
          'INSERT INTO payments(account_id,date,amount,method,notes) VALUES (?,?,?,?,?)',
          [account.id, p.date, p.amount, p.method, p.notes],
          db,
        )
      ).insertId;
    return { id };
  });
}
export async function activitySave(body: unknown, id?: number) {
  const p = activitySchema.parse(body);
  return peopleTransaction(async (db) => {
    if (id) {
      requireFound((await query('SELECT id FROM activities WHERE id=? FOR UPDATE', [id], db))[0]);
      await validateActivityChange(id, p.instructor_id, p.mode, db);
      await execute(
        'UPDATE activities SET name=?,instructor_id=?,active=?,mode=? WHERE id=?',
        [p.name, p.instructor_id, p.active, p.mode, id],
        db,
      );
      await execute('DELETE FROM activity_allowed_days WHERE activity_id=?', [id], db);
    } else
      id = (
        await execute(
          'INSERT INTO activities(name,instructor_id,active,mode) VALUES (?,?,?,?)',
          [p.name, p.instructor_id, p.active, p.mode],
          db,
        )
      ).insertId;
    for (const day of p.days)
      await execute(
        'INSERT INTO activity_allowed_days(activity_id,day) VALUES (?,?)',
        [id, day],
        db,
      );
    return { id };
  });
}
export const positiveId = z.coerce.number().int().positive();
