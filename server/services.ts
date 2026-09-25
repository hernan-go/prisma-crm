import { z } from 'zod';
import {
  activitySchema,
  enrollmentSchema,
  personSchema,
  paymentSchema,
  validateDays,
} from '../shared/domain.js';
import { query, execute, transaction, peopleTransaction } from './db.js';
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
  return transaction(async (db) => {
    if (id)
      requireFound((await query('SELECT id FROM enrollments WHERE id=? FOR UPDATE', [id], db))[0]);
    requireFound(
      (await query('SELECT id FROM people WHERE id=? AND activo=1', [p.person_id], db))[0],
    );
    requireFound((await query('SELECT id FROM periods WHERE id=?', [p.period_id], db))[0]);
    const [activity] = await query(
      'SELECT a.id FROM activities a JOIN instructors i ON i.id=a.instructor_id WHERE a.id=? AND a.active=1 AND i.active=1 FOR UPDATE',
      [p.activity_id],
      db,
    );
    requireFound(activity);
    const allowed = (
      await query('SELECT day FROM activity_allowed_days WHERE activity_id=?', [p.activity_id], db)
    ).map((r) => r.day);
    if (!validateDays(p.slots, allowed))
      throw new AppError(422, 'Hay un día no permitido para esta actividad.');
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
  });
}
export async function paymentSave(body: unknown, id?: number) {
  const p = paymentSchema.parse(body);
  return transaction(async (db) => {
    if (id)
      requireFound((await query('SELECT id FROM payments WHERE id=? FOR UPDATE', [id], db))[0]);
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
  return transaction(async (db) => {
    if (id) {
      requireFound((await query('SELECT id FROM activities WHERE id=? FOR UPDATE', [id], db))[0]);
      await execute(
        'UPDATE activities SET name=?,instructor_id=?,active=? WHERE id=?',
        [p.name, p.instructor_id, p.active, id],
        db,
      );
      await execute('DELETE FROM activity_allowed_days WHERE activity_id=?', [id], db);
    } else
      id = (
        await execute(
          'INSERT INTO activities(name,instructor_id,active) VALUES (?,?,?)',
          [p.name, p.instructor_id, p.active],
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
