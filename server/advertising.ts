import { advertisingSchema } from '../shared/domain.js';
import { peopleTransaction, query, execute, type Connection } from './db.js';
import { openPeriod } from './scheduling.js';
import { requireFound } from './errors.js';
async function checkDate(date: string, db: Connection) {
  const list = await query(
    'SELECT id FROM periods WHERE year=? AND month=?',
    [Number(date.slice(0, 4)), Number(date.slice(5, 7))],
    db,
  );
  for (const p of list) await openPeriod(p.id, db);
}
export async function advertisingSave(body: unknown, id?: number) {
  const p = advertisingSchema.parse(body);
  return peopleTransaction(async (db) => {
    if (id) {
      const [old] = await query('SELECT date FROM advertising_investments WHERE id=?', [id], db);
      requireFound(old);
      await checkDate(old.date, db);
    }
    await checkDate(p.date, db);
    if (id)
      await execute(
        'UPDATE advertising_investments SET date=?,concept=?,amount=?,notes=? WHERE id=?',
        [p.date, p.concept, p.amount, p.notes, id],
        db,
      );
    else
      id = (
        await execute(
          'INSERT INTO advertising_investments(date,concept,amount,notes) VALUES (?,?,?,?)',
          [p.date, p.concept, p.amount, p.notes],
          db,
        )
      ).insertId;
    return { id };
  });
}
export async function advertisingDelete(id: number) {
  return peopleTransaction(async (db) => {
    const [old] = await query('SELECT date FROM advertising_investments WHERE id=?', [id], db);
    requireFound(old);
    await checkDate(old.date, db);
    await execute('DELETE FROM advertising_investments WHERE id=?', [id], db);
    return { ok: true };
  });
}
