import { pool, query } from '../db.js';
import { AppError } from '../errors.js';
import { readEventEconomy } from '../event-economy.js';
export async function eventsContext(period: string) {
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [p] = await query<{ id: number }>(
      'SELECT id FROM periods WHERE year=? AND month=?',
      [Number(period.slice(0, 4)), Number(period.slice(5))],
      db,
    );
    if (!p) throw new AppError(404, 'Período inexistente.');
    const result = await readEventEconomy(p.id, db);
    await db.commit();
    return result;
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    db.release();
  }
}
