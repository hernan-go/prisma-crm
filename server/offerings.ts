import { Router } from 'express';
import { query, execute, peopleTransaction, pool, type Connection } from './db.js';
import { openPeriod } from './scheduling.js';
import { AppError, requireFound } from './errors.js';
import {
  offeringSchema,
  scheduleSchema,
  instructorSchema,
  facilitatorName,
} from '../shared/domain.js';
import { overlaps } from '../shared/schedule.js';
import { z } from 'zod';
import {
  deleteCatalogInDB,
  deleteOfferingConfiguration,
  deleteScheduleConfiguration,
} from './configuration-deletion.js';
const id = (v: unknown) => z.coerce.number().int().positive().parse(v);
export type Schedule = {
  id: number;
  offering_id: number;
  period_id: number;
  activity_id: number;
  activity: string;
  mode: string;
  active: number;
  ever_used: number;
  offered: number;
  catalog_active: number;
  day: number;
  start: string;
  end: string;
  instructors: { id: number; name: string; active: number }[];
};
export type Offering = {
  id: number;
  period_id: number;
  activity_id: number;
  name: string;
  mode: string;
  active: number;
  catalog_active: number;
  ever_used: number;
  days: number[];
  schedules: Schedule[];
};
export async function scheduleList(period: number, db: Connection = pool): Promise<Schedule[]> {
  const rows = await query<Schedule>(
    `SELECT s.*,o.period_id,o.activity_id,o.name activity,o.mode,o.active offered,a.active catalog_active
    FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id JOIN activities a ON a.id=o.activity_id WHERE o.period_id=? ORDER BY s.day,s.start,s.id`,
    [period],
    db,
  );
  const instructors = await query<{
    schedule_id: number;
    id: number;
    name: string;
    active: number;
  }>(
    `SELECT si.schedule_id,si.instructor_id id,CONCAT_WS(' ',i.name,NULLIF(i.surname,'')) name,i.active FROM schedule_instructors si JOIN instructors i ON i.id=si.instructor_id JOIN activity_schedules s ON s.id=si.schedule_id JOIN period_activities o ON o.id=s.offering_id WHERE o.period_id=?`,
    [period],
    db,
  );
  return rows.map((s) => ({
    ...s,
    instructors: instructors.filter((i) => i.schedule_id === s.id),
  }));
}
export async function offeringList(period: number): Promise<Offering[]> {
  const rows = await query<Offering>(
    'SELECT o.*,a.active catalog_active FROM period_activities o JOIN activities a ON a.id=o.activity_id WHERE o.period_id=? ORDER BY o.name',
    [period],
  );
  const days = await query(
    'SELECT d.* FROM period_activity_days d JOIN period_activities o ON o.id=d.offering_id WHERE o.period_id=?',
    [period],
  );
  const schedules = await scheduleList(period);
  return rows.map((o) => ({
    ...o,
    days: days.filter((d) => d.offering_id === o.id).map((d) => d.day),
    schedules: schedules.filter((s) => s.offering_id === o.id),
  }));
}
export async function offeringSave(body: unknown, oid?: number) {
  const p = offeringSchema.parse(body);
  return peopleTransaction(async (db) => {
    await openPeriod(p.period_id, db);
    const [a] = await query('SELECT * FROM activities WHERE id=?', [p.activity_id], db);
    requireFound(a);
    if (oid) {
      const [old] = await query('SELECT * FROM period_activities WHERE id=?', [oid], db);
      requireFound(old);
      if (old.period_id !== p.period_id || old.activity_id !== p.activity_id)
        throw new AppError(409, 'No se puede trasladar una oferta a otro período o actividad.');
      if (!a.active && p.active && !old.active)
        throw new AppError(409, 'La actividad está archivada.');
      if (old.ever_used && old.mode !== p.mode)
        throw new AppError(409, 'Una oferta utilizada conserva su modalidad histórica.');
      const schedules = await query(
        'SELECT day FROM activity_schedules WHERE offering_id=? AND active=1',
        [oid],
        db,
      );
      if (schedules.some((s) => !p.days.includes(s.day)))
        throw new AppError(409, 'Hay horarios habilitados en días que intentás quitar.');
      if (p.active && !old.active) {
        const all = await scheduleList(p.period_id, db);
        const occupied = await query(
          'SELECT DISTINCT es.schedule_id FROM enrollment_slots es JOIN enrollments e ON e.id=es.enrollment_id WHERE e.period_id=?',
          [p.period_id],
          db,
        );
        for (const s of all.filter((s) => s.offering_id === oid && s.active))
          for (const other of all) {
            if (
              other.id === s.id ||
              !(
                (other.active && (other.offered || other.offering_id === oid)) ||
                occupied.some((x) => x.schedule_id === other.id)
              ) ||
              !overlaps(s, other)
            )
              continue;
            if (s.instructors.some((i) => other.instructors.some((j) => j.id === i.id)))
              throw new AppError(
                409,
                `Facilitador ocupado: ${other.activity} ${other.start}–${other.end}.`,
              );
          }
      }
      await execute(
        'UPDATE period_activities SET mode=?,active=? WHERE id=?',
        [p.mode, p.active, oid],
        db,
      );
      await execute('DELETE FROM period_activity_days WHERE offering_id=?', [oid], db);
    } else {
      if (!a.active) throw new AppError(409, 'La actividad está archivada.');
      oid = (
        await execute(
          'INSERT INTO period_activities(period_id,activity_id,name,mode,active) VALUES (?,?,?,?,?)',
          [p.period_id, p.activity_id, a.name, p.mode, p.active],
          db,
        )
      ).insertId;
      await execute('UPDATE activities SET ever_used=1 WHERE id=?', [a.id], db);
    }
    for (const day of p.days)
      await execute(
        'INSERT INTO period_activity_days(offering_id,day) VALUES (?,?)',
        [oid, day],
        db,
      );
    return { id: oid };
  });
}
export async function scheduleSave(body: unknown, sid?: number) {
  const p = scheduleSchema.parse(body);
  return peopleTransaction(async (db) => {
    const [o] = await query(
      'SELECT o.*,a.active catalog_active FROM period_activities o JOIN activities a ON a.id=o.activity_id WHERE o.id=?',
      [p.offering_id],
      db,
    );
    requireFound(o);
    await openPeriod(o.period_id, db);
    const all = await scheduleList(o.period_id, db);
    const old = sid ? all.find((s) => s.id === sid) : undefined;
    if (sid) requireFound(old);
    if (old && old.offering_id !== p.offering_id)
      throw new AppError(409, 'No se puede trasladar un horario.');
    const same =
      old &&
      old.day === p.day &&
      old.start === p.start &&
      old.end === p.end &&
      JSON.stringify(
        old.instructors.map((i: any) => i.id).sort((a: number, b: number) => a - b),
      ) === JSON.stringify([...p.instructor_ids].sort((a, b) => a - b));
    if (old?.ever_used && !same)
      throw new AppError(
        409,
        'Horario utilizado: conservá su historial y creá otro horario. Podés deshabilitarlo para nuevas inscripciones.',
      );
    if (p.active && (!o.active || !o.catalog_active))
      throw new AppError(409, 'La oferta o actividad no está habilitada.');
    const allowed = await query(
      'SELECT day FROM period_activity_days WHERE offering_id=?',
      [o.id],
      db,
    );
    if (p.active && !allowed.some((d) => d.day === p.day))
      throw new AppError(422, 'Día no permitido en esta oferta.');
    const selected = [];
    for (const iid of p.instructor_ids) {
      const [i] = await query('SELECT * FROM instructors WHERE id=?', [iid], db);
      requireFound(i);
      if (!i.active && !old?.instructors.some((x: any) => x.id === iid))
        throw new AppError(409, 'Un facilitador inactivo no puede asignarse a nuevos horarios.');
      selected.push(i);
    }
    // Occupied historical blocks still reserve their facilitators even if disabled for new admissions.
    const occupied = await query(
      'SELECT DISTINCT es.schedule_id FROM enrollment_slots es JOIN enrollments e ON e.id=es.enrollment_id WHERE e.period_id=?',
      [o.period_id],
      db,
    );
    if (p.active || occupied.some((x) => x.schedule_id === sid))
      for (const s of all) {
        if (
          s.id === sid ||
          (!(s.active && s.offered) && !occupied.some((x) => x.schedule_id === s.id)) ||
          !overlaps(p, s)
        )
          continue;
        if (p.instructor_ids.some((iid) => s.instructors.some((i: any) => i.id === iid)))
          throw new AppError(409, `Facilitador ocupado: ${s.activity} ${s.start}–${s.end}.`);
      }
    if (sid)
      await execute(
        'UPDATE activity_schedules SET day=?,start=?,end=?,active=? WHERE id=?',
        [p.day, p.start, p.end, p.active, sid],
        db,
      );
    else
      sid = (
        await execute(
          'INSERT INTO activity_schedules(offering_id,day,start,end,active) VALUES (?,?,?,?,?)',
          [p.offering_id, p.day, p.start, p.end, p.active],
          db,
        )
      ).insertId;
    if (!same) {
      await execute('DELETE FROM schedule_instructors WHERE schedule_id=?', [sid], db);
      for (const i of selected) {
        await execute(
          'INSERT INTO schedule_instructors(schedule_id,instructor_id,display_name) VALUES (?,?,?)',
          [sid, i.id, facilitatorName(i as any)],
          db,
        );
        await execute('UPDATE instructors SET ever_used=1 WHERE id=?', [i.id], db);
      }
    }
    return { id: sid };
  });
}
export async function instructorSave(body: unknown, iid?: number) {
  const p = instructorSchema.parse(body);
  return peopleTransaction(async (db) => {
    const fields = ['name', 'surname', 'dni', 'phone', 'email', 'address', 'active'] as const;
    if (iid) {
      requireFound((await query('SELECT id FROM instructors WHERE id=?', [iid], db))[0]);
      await execute(
        `UPDATE instructors SET ${fields.map((f) => f + '=?').join(',')} WHERE id=?`,
        [...fields.map((f) => p[f]), iid],
        db,
      );
    } else
      iid = (
        await execute(
          `INSERT INTO instructors(${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
          fields.map((f) => p[f]),
          db,
        )
      ).insertId;
    return { id: iid };
  });
}
export async function deleteCatalog(kind: 'activities' | 'instructors', iid: number) {
  return peopleTransaction((db) => deleteCatalogInDB(kind, iid, db));
}
export const offerings = Router();
offerings.get('/offerings', async (req, res) =>
  res.json(await offeringList(id(req.query.period_id))),
);
offerings.post('/offerings', async (req, res) =>
  res.status(201).json(await offeringSave(req.body)),
);
offerings.put('/offerings/:id', async (req, res) =>
  res.json(await offeringSave(req.body, id(req.params.id))),
);
offerings.post('/schedules', async (req, res) =>
  res.status(201).json(await scheduleSave(req.body)),
);
offerings.put('/schedules/:id', async (req, res) =>
  res.json(await scheduleSave(req.body, id(req.params.id))),
);
offerings.delete('/offerings/:id', async (req, res) => {
  const offering = id(req.params.id);
  await peopleTransaction((db) => deleteOfferingConfiguration(offering, db));
  res.json({ ok: true });
});
offerings.delete('/schedules/:id', async (req, res) => {
  const schedule = id(req.params.id);
  await peopleTransaction((db) => deleteScheduleConfiguration(schedule, db));
  res.json({ ok: true });
});
offerings.get('/agenda', async (req, res) => {
  const period = id(req.query.period_id);
  let rows = await scheduleList(period);
  const people = await query(
    'SELECT e.id enrollment_id,e.person_id,p.nombre,p.apellido,p.public_id,s.schedule_id FROM enrollment_slots s JOIN enrollments e ON e.id=s.enrollment_id JOIN people p ON p.id=e.person_id WHERE e.period_id=?',
    [period],
  );
  if (req.query.instructor_id)
    rows = rows.filter((s) => s.instructors.some((i: any) => i.id === id(req.query.instructor_id)));
  if (req.query.activity_id) rows = rows.filter((s) => s.activity_id === id(req.query.activity_id));
  if (req.query.day !== undefined) {
    const day = z.coerce.number().int().min(0).max(6).parse(req.query.day);
    rows = rows.filter((s) => s.day === day);
  }
  if (req.query.start) {
    const start = z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .parse(req.query.start);
    rows = rows.filter((s) => s.start === start);
  }
  res.json(rows.map((s) => ({ ...s, people: people.filter((p) => p.schedule_id === s.id) })));
});
