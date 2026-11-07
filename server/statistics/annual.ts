import { pool, query, type Connection } from '../db.js';
import { statisticsYearSchema, type StatisticsPeriod } from '../../shared/statistics.js';
import { calculateAnnual, type AnnualInput } from './annual-engine.js';

// Three bounded query shapes for any number of periods; no per-month requests.
export async function readAnnualInput(year: number, db: Connection): Promise<AnnualInput> {
  const periods = await query<StatisticsPeriod>(
    'SELECT id,year,month,status FROM periods WHERE year<=? ORDER BY year,month',
    [year],
    db,
  );
  const members = await query<AnnualInput['members'][number]>(
    `
    SELECT m.period_id,a.id account_id,a.amount_due,COALESCE(p.paid,0) paid,COALESCE(p.payment_count,0) payment_count
    FROM period_memberships m JOIN periods y ON y.id=m.period_id AND y.year=?
    LEFT JOIN monthly_accounts a ON a.person_id=m.person_id AND a.period_id=m.period_id
    LEFT JOIN (SELECT p.account_id,SUM(p.amount) paid,COUNT(*) payment_count FROM payments p
      JOIN monthly_accounts a ON a.id=p.account_id JOIN periods y ON y.id=a.period_id
      WHERE y.year=? GROUP BY p.account_id) p ON p.account_id=a.id`,
    [year, year],
    db,
  );
  const enrollments = await query<AnnualInput['enrollments'][number]>(
    `
    SELECT DISTINCT e.period_id,e.person_id FROM enrollments e
    JOIN periods p ON p.id=e.period_id WHERE p.year<=?`,
    [year],
    db,
  );
  return { periods, members, enrollments };
}

export async function statisticsAnnual(value: unknown) {
  const year = statisticsYearSchema.parse(value);
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const result = calculateAnnual(year, await readAnnualInput(year, db), new Date().toISOString());
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
