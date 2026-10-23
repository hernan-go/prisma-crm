import { Router } from 'express';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import {
  recurringPresenceSchema,
  recurringPositionSchema,
  recurringRemovalSchema,
  recurringConceptSaveSchema,
  recurringSaveSchema,
  recurringLinkSchema,
  recurringAmountRemovalSchema,
  prismaRecurringPreset,
  type RecurringConcept,
  type RecurringTile,
} from '../shared/recurring-expenses.js';
import { expenseSchemaForPeriod, type Expense } from '../shared/expenses.js';
import { query, execute, peopleTransaction, transaction, type Connection } from './db.js';
import { AppError, requireFound } from './errors.js';
import { positiveId } from './services.js';
import { openPeriod } from './scheduling.js';

import {
  requireRecurringSchema,
  lockRecurringRevision,
  advanceRecurringRevision,
  normalizeRecurringPositions,
} from './recurring-periods.js';
type MonthlyExpense = Expense & { recurring_single: number };
function found<T>(row: T | undefined): T {
  requireFound(row);
  return row!;
}
const conflict = (message: string) => new AppError(409, message);
async function concept(id: number, db: Connection) {
  return found(
    (
      await query<RecurringConcept>(
        'SELECT id,name,icon_name,active,sort_order FROM expense_recurring_concepts WHERE id=? FOR UPDATE',
        [id],
        db,
      )
    )[0],
  );
}
async function movements(category: number, db: Connection) {
  return query<MonthlyExpense>(
    'SELECT id,category_id,concept,date,amount,notes,recurring_single FROM period_expenses WHERE category_id=? ORDER BY id FOR UPDATE',
    [category],
    db,
  );
}

// Every generic write locks and rejects linked categories; monthly writes use this module.
export async function requireAdditionalCategory(period: number, category: number, db: Connection) {
  const row = found(
    (
      await query<{ id: number; recurring_concept_id: number | null }>(
        'SELECT id,recurring_concept_id FROM period_expense_categories WHERE id=? AND period_id=? FOR UPDATE',
        [category, period],
        db,
      )
    )[0],
  );
  if (row.recurring_concept_id !== null)
    throw conflict(
      'Categoría recurrente: usá su tarjeta. Los históricos múltiples requieren revisión explícita.',
    );
  const marked = await query(
    'SELECT id FROM period_expenses WHERE category_id=? AND recurring_single=1 FOR UPDATE',
    [category],
    db,
  );
  if (marked.length) throw conflict('Marcador recurrente inconsistente: requiere revisión.');
}

export async function recurringCatalogue() {
  const rows = await query<RecurringConcept>(
    'SELECT id,name,icon_name,active,sort_order FROM expense_recurring_concepts ORDER BY sort_order,id',
  );
  return rows.map((row) => ({ ...row, active: Boolean(row.active) }));
}
export async function configurePrismaRecurring(body: unknown) {
  await requireRecurringSchema();
  z.object({ confirm: z.literal('PRISMA') })
    .strict()
    .parse(body);
  return peopleTransaction(async (db) => {
    const rows = await query<RecurringConcept>(
      'SELECT id,name,icon_name,active,sort_order FROM expense_recurring_concepts FOR UPDATE',
      [],
      db,
    );
    // Existing catalogues need explicit selection/editing, never guessed name reuse.
    if (rows.length)
      throw conflict(
        'El catálogo ya tiene conceptos. Revisalos por ID; no se sobrescribió ni agregó ninguno.',
      );
    for (const entry of prismaRecurringPreset)
      await execute(
        'INSERT INTO expense_recurring_concepts(name,icon_name,active,sort_order) VALUES (?,?,?,?)',
        [entry.name, entry.icon_name, entry.active, entry.sort_order],
        db,
      );
    return { ok: true };
  });
}
export async function recurringConceptSave(body: unknown, id?: number) {
  await requireRecurringSchema();
  const input = recurringConceptSaveSchema.parse(body);
  return peopleTransaction(async (db) => {
    const existing = id !== undefined ? await concept(id, db) : undefined;
    const order =
      input.sort_order ??
      existing?.sort_order ??
      (
        await query<{ next_order: number }>(
          'SELECT LEAST(COALESCE(MAX(sort_order),0)+10,65535) next_order FROM expense_recurring_concepts',
          [],
          db,
        )
      )[0].next_order;
    if (
      (
        await query(
          'SELECT id FROM expense_recurring_concepts WHERE name=? AND id<>? FOR UPDATE',
          [input.name, id ?? 0],
          db,
        )
      ).length
    )
      throw conflict('Ya existe un concepto con ese nombre.');
    if (id !== undefined)
      await execute(
        'UPDATE expense_recurring_concepts SET name=?,icon_name=?,active=?,sort_order=? WHERE id=?',
        [input.name, input.icon_name, input.active, order, id],
        db,
      );
    else
      id = (
        await execute(
          'INSERT INTO expense_recurring_concepts(name,icon_name,active,sort_order) VALUES (?,?,?,?)',
          [input.name, input.icon_name, input.active, order],
          db,
        )
      ).insertId;
    return { id };
  });
}
export async function recurringTiles(period: number, db?: Connection): Promise<RecurringTile[]> {
  await requireRecurringSchema(db);
  requireFound((await query('SELECT id FROM periods WHERE id=?', [period], db))[0]);
  // One statement keeps catalogue, links and amounts consistent during concurrent writes.
  const rows = await query<
    RecurringConcept & {
      position: number;
      revision: string;
      category_id: number | null;
      category_name: string | null;
      expense_id: number | null;
      concept: string;
      date: string;
      amount: string;
      notes: string;
      recurring_single: number;
    }
  >(
    `SELECT m.position,CAST(s.revision AS CHAR) revision,r.id,r.name,r.icon_name,r.active,r.sort_order,c.id category_id,c.name category_name,
     e.id expense_id,e.concept,e.date,e.amount,e.notes,e.recurring_single
     FROM period_recurring_concepts m
     JOIN period_recurring_settings s ON s.period_id=m.period_id
     JOIN expense_recurring_concepts r ON r.id=m.recurring_concept_id
     LEFT JOIN period_expense_categories c ON c.recurring_concept_id=r.id AND c.period_id=m.period_id
     LEFT JOIN period_expenses e ON e.category_id=c.id
     WHERE m.period_id=? ORDER BY m.position,e.id`,
    [period],
    db,
  );
  const result = new Map<number, RecurringTile>();
  const valid = new Map<number, boolean>();
  for (const row of rows) {
    let tile = result.get(row.id);
    if (!tile) {
      tile = {
        id: row.id,
        position: row.position,
        revision: row.revision,
        name: row.name,
        icon_name: row.icon_name,
        active: Boolean(row.active),
        sort_order: row.sort_order,
        category_id: row.category_id,
        category_name: row.category_name,
        expenses: [],
        amount: null,
        status: 'missing',
      };
      result.set(row.id, tile);
    }
    if (row.expense_id !== null) {
      tile.expenses.push({
        id: row.expense_id,
        category_id: row.category_id!,
        concept: row.concept,
        date: row.date,
        amount: row.amount,
        notes: row.notes,
      });
      valid.set(row.id, Boolean(row.recurring_single));
      tile.amount = new Decimal(tile.amount ?? 0).plus(row.amount).toFixed(2);
    }
  }
  for (const tile of result.values())
    tile.status = !tile.expenses.length
      ? 'missing'
      : tile.expenses.length === 1 && valid.get(tile.id)
        ? 'single'
        : 'review';
  return [...result.values()];
}

export async function recurringLink(
  period: number,
  recurring: number,
  body: unknown,
  unlink = false,
) {
  const { category_id: category, revision } = recurringLinkSchema.parse(body);
  return peopleTransaction(async (db) => {
    await openPeriod(period, db);
    await lockRecurringRevision(period, revision, db, recurring);
    await concept(recurring, db);
    const row = found(
      (
        await query<{ recurring_concept_id: number | null }>(
          'SELECT recurring_concept_id FROM period_expense_categories WHERE id=? AND period_id=? FOR UPDATE',
          [category, period],
          db,
        )
      )[0],
    );
    const expenses = await movements(category, db);
    if (unlink) {
      if (row.recurring_concept_id !== recurring)
        throw conflict('El vínculo cambió; volvé a consultar.');
      await execute(
        'UPDATE period_expenses SET recurring_single=0,updated_at=updated_at WHERE category_id=?',
        [category],
        db,
      );
      await execute(
        'UPDATE period_expense_categories SET recurring_concept_id=NULL,updated_at=updated_at WHERE id=?',
        [category],
        db,
      );
    } else {
      if (row.recurring_concept_id !== null) throw conflict('La categoría ya está vinculada.');
      if (
        (
          await query(
            'SELECT id FROM period_expense_categories WHERE period_id=? AND recurring_concept_id=? FOR UPDATE',
            [period, recurring],
            db,
          )
        ).length
      )
        throw conflict('Este concepto ya tiene categoría en el período.');
      if (expenses.some((e) => e.recurring_single)) throw conflict('Marcador inconsistente.');
      await execute(
        'UPDATE period_expense_categories SET recurring_concept_id=?,updated_at=updated_at WHERE id=?',
        [recurring, category],
        db,
      );
      if (expenses.length === 1)
        await execute(
          'UPDATE period_expenses SET recurring_single=1,updated_at=updated_at WHERE id=?',
          [expenses[0].id],
          db,
        );
    }
    await advanceRecurringRevision(period, db);
    return { ok: true };
  });
}
const sameExpense = (a: Expense, b: Omit<Expense, 'id' | 'category_id'>) =>
  a.concept === b.concept &&
  a.date === b.date &&
  new Decimal(a.amount).eq(b.amount) &&
  a.notes === b.notes;
export async function recurringSave(period: number, recurring: number, body: unknown) {
  const input = recurringSaveSchema.parse(body);
  return peopleTransaction(async (db) => {
    const selected = await openPeriod(period, db);
    await lockRecurringRevision(period, input.revision, db, recurring);
    const r = await concept(recurring, db);
    expenseSchemaForPeriod(`${selected.year}-${String(selected.month).padStart(2, '0')}`).parse(
      input.expense,
    );
    let category = (
      await query<{ id: number }>(
        'SELECT id FROM period_expense_categories WHERE period_id=? AND recurring_concept_id=? FOR UPDATE',
        [period, recurring],
        db,
      )
    )[0]?.id;
    const rows = category ? await movements(category, db) : [];
    if (rows.length > 1 || rows.some((e) => !e.recurring_single))
      throw conflict('Históricos en revisión: no se puede editar una suma.');
    const current = rows[0];
    if (input.expected === null && current) {
      if (sameExpense(current, input.expense)) return { id: current.id };
      throw conflict('Otra carga ya registró el importe. Volvé a abrir la tarjeta.');
    }
    if (
      input.expected !== null &&
      (!current || current.id !== input.expected.id || !sameExpense(current, input.expected))
    )
      throw conflict('El gasto cambió desde que abriste el formulario. Volvé a consultarlo.');

    if (!category) {
      if (
        (
          await query(
            'SELECT id FROM period_expense_categories WHERE period_id=? AND name=? FOR UPDATE',
            [period, r.name],
            db,
          )
        ).length
      )
        throw conflict('Ya existe una categoría con este nombre. Vinculala explícitamente por ID.');
      category = (
        await execute(
          'INSERT INTO period_expense_categories(period_id,name,recurring_concept_id) VALUES (?,?,?)',
          [period, r.name, recurring],
          db,
        )
      ).insertId;
    }
    const e = input.expense;
    if (current) {
      await execute(
        'UPDATE period_expenses SET concept=?,date=?,amount=?,notes=? WHERE id=? AND category_id=?',
        [e.concept, e.date, e.amount, e.notes, current.id, category],
        db,
      );
      await advanceRecurringRevision(period, db);
      return { id: current.id };
    }
    await advanceRecurringRevision(period, db);
    return {
      id: (
        await execute(
          'INSERT INTO period_expenses(category_id,concept,date,amount,notes,recurring_single) VALUES (?,?,?,?,?,1)',
          [category, e.concept, e.date, e.amount, e.notes],
          db,
        )
      ).insertId,
    };
  });
}

export async function recurringRemoveAmount(period: number, recurring: number, body: unknown) {
  const input = recurringAmountRemovalSchema.parse(body);
  const revision = input.revision;
  return peopleTransaction(async (db) => {
    await openPeriod(period, db);
    await lockRecurringRevision(period, revision, db, recurring);
    await concept(recurring, db);
    const category = found(
      (
        await query<{ id: number }>(
          'SELECT id FROM period_expense_categories WHERE period_id=? AND recurring_concept_id=? FOR UPDATE',
          [period, recurring],
          db,
        )
      )[0],
    );
    const rows = await movements(category.id, db);
    if (rows.length !== 1 || !rows[0].recurring_single)
      throw conflict(
        'El importe no es un único movimiento mensual editable. Revisá el detalle histórico.',
      );
    const current = rows[0];
    if (current.id !== input.expected.id || !sameExpense(current, input.expected))
      throw conflict(
        'El gasto cambió desde que abriste la confirmación. Volvé a consultar la tarjeta.',
      );
    const result = await execute(
      'DELETE FROM period_expenses WHERE id=? AND category_id=? AND recurring_single=1',
      [current.id, category.id],
      db,
    );
    if (result.affectedRows !== 1) throw conflict('El gasto cambió; volvé a consultar la tarjeta.');
    await advanceRecurringRevision(period, db);
    return { ok: true };
  });
}

export async function recurringSnapshot(period: number) {
  await requireRecurringSchema();
  return transaction(async (db) => {
    requireFound((await query('SELECT id FROM periods WHERE id=?', [period], db))[0]);
    const [settings] = await query<{ revision: string }>(
      'SELECT CAST(revision AS CHAR) revision FROM period_recurring_settings WHERE period_id=?',
      [period],
      db,
    );
    if (!settings) throw conflict('Falta configuración del período: requiere revisión.');
    const inconsistent = await query(
      `SELECT c.id FROM period_expense_categories c
      WHERE c.period_id=? AND c.recurring_concept_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM period_expenses e WHERE e.category_id=c.id)
      AND NOT EXISTS(SELECT 1 FROM period_recurring_concepts m WHERE m.period_id=c.period_id AND m.recurring_concept_id=c.recurring_concept_id)`,
      [period],
      db,
    );
    if (inconsistent.length)
      throw conflict(
        'Hay gastos recurrentes sin presencia mensual. Se conservan en Estadísticas y requieren revisión.',
      );
    return { revision: settings.revision, tiles: await recurringTiles(period, db) };
  });
}

export async function recurringMembership(
  period: number,
  recurring: number,
  body: unknown,
  action: 'add' | 'remove' | 'position',
) {
  const input: {
    revision: string;
    position?: number;
    expected?: z.infer<typeof recurringRemovalSchema>['expected'];
  } =
    action === 'remove'
      ? recurringRemovalSchema.parse(body)
      : action === 'position'
        ? recurringPositionSchema.parse(body)
        : recurringPresenceSchema.parse(body);
  return peopleTransaction(async (db) => {
    await openPeriod(period, db);
    await lockRecurringRevision(period, input.revision, db);
    await concept(recurring, db);
    const rows = await query<{ recurring_concept_id: number; position: number }>(
      'SELECT recurring_concept_id,position FROM period_recurring_concepts WHERE period_id=? ORDER BY position FOR UPDATE',
      [period],
      db,
    );
    if (rows.some((r, i) => r.position !== i + 1))
      throw conflict('Orden mensual inconsistente: requiere revisión.');
    let ids = rows.map((r) => r.recurring_concept_id);
    const index = ids.indexOf(recurring);
    if (action === 'add') {
      if (index >= 0) throw conflict('El concepto ya pertenece al período.');
      const existing = await query(
        `SELECT e.id FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=? AND c.recurring_concept_id=? FOR UPDATE`,
        [period, recurring],
        db,
      );
      if (existing.length)
        throw conflict('Hay movimientos sin presencia mensual: requieren revisión.');
      await execute(
        'INSERT INTO period_recurring_concepts(period_id,recurring_concept_id,position) VALUES (?,?,?)',
        [period, recurring, ids.length + 1],
        db,
      );
    } else {
      if (index < 0) throw conflict('El concepto ya no pertenece al período.');
      if (action === 'position' && typeof input.position === 'number') {
        if (input.position > ids.length)
          throw conflict('La posición supera la cantidad de tarjetas.');
        if (input.position === index + 1) return { ok: true };
        ids.splice(index, 1);
        ids.splice(input.position - 1, 0, recurring);
      } else if ('expected' in input) {
        const [category] = await query<{ id: number }>(
          'SELECT id FROM period_expense_categories WHERE period_id=? AND recurring_concept_id=? FOR UPDATE',
          [period, recurring],
          db,
        );
        const expenses = category ? await movements(category.id, db) : [];
        if (expenses.length > 1 || expenses.some((e) => !e.recurring_single))
          throw conflict('Históricos múltiples o inconsistentes: no se puede quitar la tarjeta.');
        const current = expenses[0];
        if (
          current
            ? !input.expected ||
              current.id !== input.expected.id ||
              !sameExpense(current, input.expected)
            : input.expected !== null
        )
          throw conflict('El movimiento cambió. Revisá y confirmá nuevamente.');
        if (current) {
          const deleted = await execute(
            'DELETE FROM period_expenses WHERE id=? AND category_id=? AND recurring_single=1',
            [current.id, category.id],
            db,
          );
          if (deleted.affectedRows !== 1) throw conflict('El movimiento cambió.');
        }
        await execute(
          'DELETE FROM period_recurring_concepts WHERE period_id=? AND recurring_concept_id=?',
          [period, recurring],
          db,
        );
        ids = ids.filter((id) => id !== recurring);
      }
      await normalizeRecurringPositions(period, ids, db);
    }
    await advanceRecurringRevision(period, db);
    return { ok: true };
  });
}

export const recurringExpenses = Router();
const id = (value: unknown) => positiveId.parse(value);
const base = '/expense-recurring-concepts';
recurringExpenses.get(base, async (_req, res) => res.json(await recurringCatalogue()));
recurringExpenses.post(`${base}/prisma-preset`, async (req, res) =>
  res.status(201).json(await configurePrismaRecurring(req.body)),
);
recurringExpenses.post(base, async (req, res) =>
  res.status(201).json(await recurringConceptSave(req.body)),
);
recurringExpenses.put(`${base}/:conceptId`, async (req, res) =>
  res.json(await recurringConceptSave(req.body, id(req.params.conceptId))),
);
const monthly = '/periods/:periodId/recurring-expenses';
recurringExpenses.post(`${monthly}/:conceptId/presence`, async (req, res) =>
  res.json(
    await recurringMembership(id(req.params.periodId), id(req.params.conceptId), req.body, 'add'),
  ),
);
recurringExpenses.delete(`${monthly}/:conceptId/presence`, async (req, res) =>
  res.json(
    await recurringMembership(
      id(req.params.periodId),
      id(req.params.conceptId),
      req.body,
      'remove',
    ),
  ),
);
recurringExpenses.put(`${monthly}/:conceptId/position`, async (req, res) =>
  res.json(
    await recurringMembership(
      id(req.params.periodId),
      id(req.params.conceptId),
      req.body,
      'position',
    ),
  ),
);
recurringExpenses.get(monthly, async (req, res) =>
  res.json(await recurringSnapshot(id(req.params.periodId))),
);
recurringExpenses.put(`${monthly}/:conceptId`, async (req, res) =>
  res.json(await recurringSave(id(req.params.periodId), id(req.params.conceptId), req.body)),
);
recurringExpenses.delete(`${monthly}/:conceptId/amount`, async (req, res) =>
  res.json(
    await recurringRemoveAmount(id(req.params.periodId), id(req.params.conceptId), req.body),
  ),
);
recurringExpenses.post(`${monthly}/:conceptId/link`, async (req, res) =>
  res.json(await recurringLink(id(req.params.periodId), id(req.params.conceptId), req.body)),
);
recurringExpenses.delete(`${monthly}/:conceptId/link`, async (req, res) =>
  res.json(await recurringLink(id(req.params.periodId), id(req.params.conceptId), req.body, true)),
);
