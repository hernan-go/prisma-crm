import { Router } from 'express';
import { pool, query, type Connection } from '../db.js';
import { AppError } from '../errors.js';
import { positiveId } from '../services.js';
import { statisticsPeriodSchema } from '../../shared/statistics.js';
import { Decimal } from 'decimal.js';
import { calculateSummary, type BalanceRow } from './engine.js';
import { inflationService } from './inflation.js';

export async function readSummaryInput(periodId: number, db: Connection) {
  const [row] = await query('SELECT id,year,month,status FROM periods WHERE id=?', [periodId], db);
  if (!row) throw new AppError(404, 'El período no existe.');
  const period = statisticsPeriodSchema.parse(row);
  const members = await query<BalanceRow>(
    `
    SELECT a.id account_id,a.amount_due,COALESCE(p.paid,0) paid,COALESCE(p.payment_count,0) payment_count
    FROM period_memberships m
    LEFT JOIN monthly_accounts a ON a.person_id=m.person_id AND a.period_id=m.period_id
    LEFT JOIN (SELECT p.account_id,SUM(p.amount) paid,COUNT(*) payment_count
      FROM payments p JOIN monthly_accounts a ON a.id=p.account_id
      WHERE a.period_id=? GROUP BY p.account_id) p ON p.account_id=a.id
    WHERE m.period_id=?`,
    [periodId, periodId],
    db,
  );
  const fees = await query<
    BalanceRow & {
      instructor_id: number;
      offering_id: number;
      activity_id: number;
      activity: string;
      professional: string;
    }
  >(
    `
    SELECT pairs.instructor_id,pairs.offering_id,o.activity_id,o.name activity,
      CONCAT_WS(' ',i.name,NULLIF(i.surname,'')) professional,
      a.id account_id,a.amount_due,COALESCE(p.paid,0) paid,COALESCE(p.payment_count,0) payment_count
    FROM (
      SELECT s.offering_id,si.instructor_id FROM activity_schedules s
      JOIN period_activities o ON o.id=s.offering_id
      JOIN schedule_instructors si ON si.schedule_id=s.id WHERE o.period_id=?
      UNION
      SELECT a.offering_id,a.instructor_id FROM facilitator_accounts a
      JOIN period_activities o ON o.id=a.offering_id WHERE o.period_id=?
    ) pairs
    JOIN period_activities o ON o.id=pairs.offering_id
    JOIN instructors i ON i.id=pairs.instructor_id
    LEFT JOIN facilitator_accounts a ON a.offering_id=pairs.offering_id AND a.instructor_id=pairs.instructor_id
    LEFT JOIN (SELECT p.account_id,SUM(p.amount) paid,COUNT(*) payment_count
      FROM facilitator_payments p JOIN facilitator_accounts a ON a.id=p.account_id
      JOIN period_activities o ON o.id=a.offering_id WHERE o.period_id=?
      GROUP BY p.account_id) p ON p.account_id=a.id`,
    [periodId, periodId, periodId],
    db,
  );
  const expenses = await query<{ amount: string }>(
    `
    SELECT e.amount FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id
    WHERE c.period_id=?`,
    [periodId],
    db,
  );
  return { period, members, fees, expenses };
}

export async function readSummary(periodId: number, db: Connection, asOf: string) {
  return calculateSummary(await readSummaryInput(periodId, db), asOf);
}

export async function statisticsSummary(periodId: number) {
  const db = await pool.getConnection();
  try {
    // Applies to the next transaction only; pooled session defaults stay unchanged.
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const result = await readSummary(periodId, db, new Date().toISOString());
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export async function statisticsExpenseBreakdown(periodId: number) {
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const rawPeriod = (
      await query('SELECT id,year,month,status FROM periods WHERE id=?', [periodId], db)
    )[0];
    if (!rawPeriod) throw new AppError(404, 'El período no existe.');
    const period = statisticsPeriodSchema.parse(rawPeriod);
    const rows = await query<{
      category_id: number;
      category_name: string;
      recurring_concept_name: string | null;
      amount: string;
      movement_count: number;
    }>(
      `SELECT c.id category_id,c.name category_name,r.name recurring_concept_name,
        SUM(e.amount) amount,COUNT(*) movement_count
       FROM period_expense_categories c
       JOIN period_expenses e ON e.category_id=c.id
       LEFT JOIN expense_recurring_concepts r ON r.id=c.recurring_concept_id
       WHERE c.period_id=? GROUP BY c.id,c.name,r.id,r.name ORDER BY c.name,c.id`,
      [periodId],
      db,
    );
    const recurring = rows.filter((row) => row.recurring_concept_name !== null);
    const additional = rows.filter((row) => row.recurring_concept_name === null);
    const summarize = (categories: typeof rows) => ({
      subtotal: categories.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toFixed(2),
      movement_count: categories.reduce((sum, row) => sum + row.movement_count, 0),
      categories,
    });
    const recurringSummary = summarize(recurring);
    const additionalSummary = summarize(additional);
    const result = {
      period,
      recurring: recurringSummary,
      additional: additionalSummary,
      total: new Decimal(recurringSummary.subtotal).plus(additionalSummary.subtotal).toFixed(2),
      movement_count: recurringSummary.movement_count + additionalSummary.movement_count,
    };
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
export const statistics = Router();
statistics.get('/statistics/inflation', async (_req, res) => {
  res.json(await inflationService.get());
});
statistics.get('/statistics/summary', async (req, res) => {
  res.json(await statisticsSummary(positiveId.parse(req.query.period_id)));
});
statistics.get('/statistics/expenses', async (req, res) => {
  res.json(await statisticsExpenseBreakdown(positiveId.parse(req.query.period_id)));
});
