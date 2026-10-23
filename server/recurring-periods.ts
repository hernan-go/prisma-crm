import { query, execute, type Connection } from './db.js';
import { AppError } from './errors.js';

export async function requireRecurringSchema(db?: Connection) {
  const rows = await query("SELECT name FROM schema_migrations WHERE name='011.sql'", [], db);
  if (!rows.length)
    throw new AppError(
      503,
      'Configuración mensual no disponible: falta activar la migración 011 en esta instalación.',
    );
}

export async function initializeRecurringPeriod(period: number, db: Connection) {
  await requireRecurringSchema(db);
  await execute('INSERT INTO period_recurring_settings(period_id) VALUES (?)', [period], db);
  await execute(
    `INSERT INTO period_recurring_concepts(period_id,recurring_concept_id,position)
    SELECT ?,id,ROW_NUMBER() OVER (ORDER BY sort_order,id) FROM expense_recurring_concepts WHERE active=1`,
    [period],
    db,
  );
}

export async function lockRecurringRevision(
  period: number,
  expected: string,
  db: Connection,
  concept?: number,
) {
  await requireRecurringSchema(db);
  const [row] = await query<{ revision: string }>(
    'SELECT CAST(revision AS CHAR) revision FROM period_recurring_settings WHERE period_id=? FOR UPDATE',
    [period],
    db,
  );
  if (!row || row.revision !== expected)
    throw new AppError(
      409,
      'La configuración o los gastos del período cambiaron. Cerrá el formulario y volvé a consultar.',
    );
  if (
    concept !== undefined &&
    !(
      await query(
        'SELECT recurring_concept_id FROM period_recurring_concepts WHERE period_id=? AND recurring_concept_id=? FOR UPDATE',
        [period, concept],
        db,
      )
    ).length
  )
    throw new AppError(409, 'El concepto ya no está incorporado al período.');
}

export async function advanceRecurringRevision(period: number, db: Connection) {
  await execute(
    'UPDATE period_recurring_settings SET revision=revision+1 WHERE period_id=?',
    [period],
    db,
  );
}

export async function normalizeRecurringPositions(period: number, ids: number[], db: Connection) {
  const [row] = await query<{ maximum: number }>(
    'SELECT COALESCE(MAX(position),0) maximum FROM period_recurring_concepts WHERE period_id=?',
    [period],
    db,
  );
  const offset = Number(row.maximum) + 1;
  if (Number(row.maximum) + offset > 4294967295)
    throw new AppError(409, 'Posiciones inconsistentes: requieren revisión.');
  await execute(
    'UPDATE period_recurring_concepts SET position=position+? WHERE period_id=?',
    [offset, period],
    db,
  );
  for (const [index, id] of ids.entries())
    await execute(
      'UPDATE period_recurring_concepts SET position=? WHERE period_id=? AND recurring_concept_id=?',
      [index + 1, period, id],
      db,
    );
}
