import { query, execute, type Connection } from './db.js';
import { AppError, requireFound } from './errors.js';
import { eventSchemaReady } from './event-schema.js';
export async function hasEventExpenses(db: Connection) {
  return eventSchemaReady(db);
}
export async function requireEventExpenses(db: Connection) {
  if (!(await hasEventExpenses(db)))
    throw new AppError(
      503,
      'Gastos asociados no disponibles: se requieren las migraciones 014, 015 y 016.',
    );
}
export async function eventExpenseRows(event: number, db: Connection) {
  await requireEventExpenses(db);
  return query<{
    id: number;
    category_id: number;
    category_name: string;
    period_id: number;
    concept: string;
    date: string;
    amount: string;
    notes: string;
    special_event_id: number;
    voided_at: string | null;
  }>(
    `SELECT e.*,c.name category_name,c.period_id FROM period_expenses e
     JOIN period_expense_categories c ON c.id=e.category_id WHERE e.special_event_id=? AND e.voided_at IS NULL ORDER BY e.id`,
    [event],
    db,
  );
}
export async function additionalCategory(period: number, category: number, db: Connection) {
  const [row] = await query<{ id: number; recurring_concept_id: number | null }>(
    'SELECT id,recurring_concept_id FROM period_expense_categories WHERE id=? AND period_id=? FOR UPDATE',
    [category, period],
    db,
  );
  requireFound(row);
  if (
    row.recurring_concept_id !== null ||
    (
      await query(
        'SELECT id FROM period_expenses WHERE category_id=? AND recurring_single=1',
        [category],
        db,
      )
    ).length
  )
    throw new AppError(409, 'Seleccioná una categoría de gastos adicionales.');
}
export async function cancellationExpenses(event: number, db: Connection, lock = false) {
  const rows = await eventExpenseRows(event, db);
  const plan = [];
  for (const expense of rows) {
    const [source_period] = await query<{
      id: number;
      year: number;
      month: number;
      status: string;
    }>(
      `SELECT id,year,month,status FROM periods WHERE id=? ${lock ? 'FOR UPDATE' : ''}`,
      [expense.period_id],
      db,
    );
    const [period] = await query<{ id: number; year: number; month: number; status: string }>(
      `SELECT id,year,month,status FROM periods WHERE year=? AND month=? ${lock ? 'FOR UPDATE' : ''}`,
      [Number(expense.date.slice(0, 4)), Number(expense.date.slice(5, 7))],
      db,
    );
    if (!period)
      throw new AppError(
        409,
        `Falta crear el período ${expense.date.slice(0, 7)} para conservar el gasto «${expense.concept}».`,
      );
    const [category] = await query<{ id: number }>(
      `SELECT c.id FROM period_expense_categories c WHERE c.period_id=? AND c.name=? AND c.recurring_concept_id IS NULL AND NOT EXISTS(SELECT 1 FROM period_expenses x WHERE x.category_id=c.id AND x.recurring_single=1) ${lock ? 'FOR UPDATE' : ''}`,
      [period.id, expense.category_name],
      db,
    );
    if (!category)
      throw new AppError(
        409,
        `Falta la categoría adicional «${expense.category_name}» en ${expense.date.slice(0, 7)}. No se canceló el evento.`,
      );
    plan.push({ expense_id: expense.id, category_id: category.id, period, source_period });
  }
  return plan;
}

export async function detachCancellationExpenses(
  event: number,
  authorized: number[],
  db: Connection,
) {
  const plan = await cancellationExpenses(event, db, true);
  const closed = [
    ...new Map(
      plan
        .flatMap((p) => [p.period, p.source_period])
        .filter((p) => p.status === 'closed')
        .map((p) => [p.id, p]),
    ).values(),
  ];
  if (closed.some((p) => !authorized.includes(p.id)))
    throw new AppError(
      409,
      'Autorizá explícitamente la reapertura temporal de los períodos necesarios para trasladar los gastos.',
      { reopen_periods: closed },
    );
  if (authorized.some((id) => !closed.some((p) => p.id === id)))
    throw new AppError(
      409,
      'Los períodos cambiaron. Revisá nuevamente la autorización de reapertura.',
    );
  for (const p of closed) await execute("UPDATE periods SET status='open' WHERE id=?", [p.id], db);
  for (const item of plan)
    await execute(
      'UPDATE period_expenses SET category_id=?,special_event_id=NULL WHERE id=?',
      [item.category_id, item.expense_id],
      db,
    );
  for (const p of closed)
    await execute("UPDATE periods SET status='closed' WHERE id=?", [p.id], db);
  return plan;
}
