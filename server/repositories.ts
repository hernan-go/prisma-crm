import { execute, query, type Connection } from './db.js';
import { normalizePhone, type PersonInput } from '../shared/domain.js';
export async function duplicates(p: PersonInput, db?: Connection, exclude = 0) {
  return query(
    "SELECT id,public_id,nombre,apellido FROM people WHERE id<>? AND (phone_normalized=? OR (?<>'' AND dni=?) OR (?<>'' AND email=?))",
    [exclude, normalizePhone(p.telefono), p.dni, p.dni, p.email, p.email],
    db,
  );
}
export async function savePerson(p: PersonInput, db: Connection, id?: number) {
  const data = { ...p, phone_normalized: normalizePhone(p.telefono) };
  const keys = Object.keys(data);
  if (id) {
    await execute(
      `UPDATE people SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`,
      [...Object.values(data), id],
      db,
    );
    return id;
  }
  const r = await execute(
    `INSERT INTO people (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    Object.values(data),
    db,
  );
  await execute(
    'UPDATE people SET public_id=? WHERE id=?',
    [`P-${String(r.insertId).padStart(4, '0')}`, r.insertId],
    db,
  );
  return r.insertId;
}
export const paymentSelect = `SELECT p.*,m.person_id,m.period_id,pe.nombre,pe.apellido,pe.public_id,pr.year,pr.month FROM payments p JOIN monthly_accounts m ON m.id=p.account_id JOIN people pe ON pe.id=m.person_id JOIN periods pr ON pr.id=m.period_id`;
export async function accounts(periodId: number, personId?: number) {
  return query(
    `SELECT m.*,p.nombre,p.apellido,p.public_id,COALESCE(SUM(pay.amount),0) paid,IF(m.amount_due IS NULL,NULL,m.amount_due-COALESCE(SUM(pay.amount),0)) balance FROM monthly_accounts m JOIN people p ON p.id=m.person_id LEFT JOIN payments pay ON pay.account_id=m.id WHERE m.period_id=? ${personId ? 'AND m.person_id=?' : ''} GROUP BY m.id,p.id`,
    personId ? [periodId, personId] : [periodId],
  );
}
export async function enrollmentList(periodId?: number, personId?: number) {
  const clauses: string[] = [];
  const values: number[] = [];
  if (periodId) {
    clauses.push('e.period_id=?');
    values.push(periodId);
  }
  if (personId) {
    clauses.push('e.person_id=?');
    values.push(personId);
  }
  const rows = await query(
    `SELECT e.*,a.name activity,i.name instructor,i.id instructor_id,p.nombre,p.apellido,p.public_id,pr.year,pr.month FROM enrollments e JOIN activities a ON a.id=e.activity_id JOIN instructors i ON i.id=a.instructor_id JOIN people p ON p.id=e.person_id JOIN periods pr ON pr.id=e.period_id ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY p.apellido,a.name`,
    values,
  );
  if (!rows.length) return [];
  const slots = await query(
    `SELECT * FROM enrollment_slots WHERE enrollment_id IN (${rows.map(() => '?')}) ORDER BY day,start`,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, slots: slots.filter((s) => s.enrollment_id === r.id) }));
}
