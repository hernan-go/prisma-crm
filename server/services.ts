import { openPeriod, bookings } from './scheduling.js';
import { scheduleConflict, type Booking } from '../shared/schedule.js';
import { z } from 'zod';
import { scheduleList } from './offerings.js';
import { activitySchema, enrollmentSchema, personSchema, paymentSchema } from '../shared/domain.js';
import { query, execute, peopleTransaction, type Connection } from './db.js';
import { duplicates, savePerson } from './repositories.js';
import { AppError, requireFound } from './errors.js';
import { requireMembership } from './memberships.js';
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
  let retained: number[] = [];
  if (id) {
    const [old] = await query('SELECT * FROM enrollments WHERE id=? FOR UPDATE', [id], db);
    requireFound(old);
    if (old.period_id !== p.period_id || old.person_id !== p.person_id)
      throw new AppError(409, 'La inscripción no corresponde a esta persona y período.');
    await openPeriod(old.period_id, db);
    if (
      old.period_id === p.period_id &&
      old.person_id === p.person_id &&
      old.activity_id === p.activity_id
    )
      retained = (
        await query('SELECT schedule_id FROM enrollment_slots WHERE enrollment_id=?', [id], db)
      ).map((s) => s.schedule_id);
  }
  requireFound(
    (await query('SELECT id FROM people WHERE id=? AND activo=1', [p.person_id], db))[0],
  );
  await openPeriod(p.period_id, db);
  await requireMembership(p.person_id, p.period_id, db);
  const [offering] = await query(
    'SELECT o.*,a.active catalog_active FROM period_activities o JOIN activities a ON a.id=o.activity_id WHERE o.period_id=? AND o.activity_id=? FOR UPDATE',
    [p.period_id, p.activity_id],
    db,
  );
  if (
    !offering ||
    ((!offering.active || !offering.catalog_active) &&
      p.schedule_ids.some((sid) => !retained.includes(sid)))
  )
    throw new AppError(409, 'La actividad no se ofrece en este período.');
  const schedules = await scheduleList(p.period_id, db);
  const selected = p.schedule_ids.map((sid) => {
    const s = schedules.find(
      (s) => s.id === sid && s.offering_id === offering.id && (s.active || retained.includes(sid)),
    );
    if (!s)
      throw new AppError(422, 'Seleccioná un horario habilitado de esta actividad y período.');
    return s;
  });
  const existing = await bookings(p.period_id, db, id);
  const proposed: Booking[] = [];
  for (const slot of selected) {
    const next = {
      ...slot,
      schedule_id: slot.id,
      person_id: p.person_id,
      activity_id: p.activity_id,
      activity: offering.name,
      mode: offering.mode,
      instructor_ids: slot.instructors.map((i: any) => i.id),
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
  for (const s of selected)
    await execute(
      'INSERT INTO enrollment_slots(enrollment_id,day,start,end,schedule_id) VALUES (?,?,?,?,?)',
      [eid, s.day, s.start, s.end, s.id],
      db,
    );
  await execute('UPDATE period_activities SET ever_used=1 WHERE id=?', [offering.id], db);
  for (const s of selected)
    await execute('UPDATE activity_schedules SET ever_used=1 WHERE id=?', [s.id], db);
  await execute(
    'INSERT IGNORE INTO monthly_accounts(person_id,period_id) VALUES (?,?)',
    [p.person_id, p.period_id],
    db,
  );
  return { id: eid };
}
export async function paymentSave(body: unknown, id?: number) {
  const p = paymentSchema.parse(body);
  return peopleTransaction((db) => paymentInDB(p, db, id));
}
export async function paymentInDB(body: unknown, db: Connection, id?: number) {
  const p = paymentSchema.parse(body);
  await openPeriod(p.period_id, db);
  await requireMembership(p.person_id, p.period_id, db);
  if (id) {
    const [old] = await query(
      'SELECT m.period_id,m.person_id FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE p.id=? FOR UPDATE',
      [id],
      db,
    );
    requireFound(old);
    if (old.period_id !== p.period_id || old.person_id !== p.person_id)
      throw new AppError(409, 'El pago no corresponde a esta persona y período.');
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
      'UPDATE payments SET account_id=?,date=?,amount=?,method=?,recipient=?,notes=? WHERE id=?',
      [account.id, p.date, p.amount, p.method, p.recipient, p.notes, id],
      db,
    );
  else
    id = (
      await execute(
        'INSERT INTO payments(account_id,date,amount,method,recipient,notes) VALUES (?,?,?,?,?,?)',
        [account.id, p.date, p.amount, p.method, p.recipient, p.notes],
        db,
      )
    ).insertId;
  return { id };
}
export async function activitySave(body: unknown, id?: number) {
  const p = activitySchema.parse(body);
  return peopleTransaction(async (db) => {
    if (id) {
      requireFound((await query('SELECT id FROM activities WHERE id=? FOR UPDATE', [id], db))[0]);
      await execute(
        'UPDATE activities SET name=?,active=?,mode=? WHERE id=?',
        [p.name, p.active, p.mode, id],
        db,
      );
      await execute('DELETE FROM activity_allowed_days WHERE activity_id=?', [id], db);
    } else
      id = (
        await execute(
          'INSERT INTO activities(name,active,mode) VALUES (?,?,?)',
          [p.name, p.active, p.mode],
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
