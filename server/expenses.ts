import { Router } from 'express';
import {
  expenseCategorySchema,
  expenseSchema,
  expenseSchemaForPeriod,
  type Expense,
  type ExpenseCategory,
} from '../shared/expenses.js';
import { query, execute, peopleTransaction, type Connection } from './db.js';
import { AppError, requireFound } from './errors.js';
import { openPeriod } from './scheduling.js';
import { positiveId } from './services.js';
import { requireAdditionalCategory } from './recurring-expenses.js';

async function requireCategory(period: number, category: number, db: Connection) {
  await requireAdditionalCategory(period, category, db);
}

async function requireExpense(category: number, expense: number, db: Connection) {
  requireFound(
    (
      await query(
        'SELECT id FROM period_expenses WHERE id=? AND category_id=?',
        [expense, category],
        db,
      )
    )[0],
  );
}

export async function expenseCategories(period: number) {
  requireFound((await query('SELECT id FROM periods WHERE id=?', [period]))[0]);
  const categories = await query<Omit<ExpenseCategory, 'expenses'>>(
    'SELECT id,period_id,name,recurring_concept_id FROM period_expense_categories WHERE period_id=? ORDER BY id',
    [period],
  );
  const rows = await query<Expense>(
    'SELECT e.id,e.category_id,e.concept,e.date,e.amount,e.notes FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=? ORDER BY e.date DESC,e.id DESC',
    [period],
  );
  return categories.map((category) => ({
    ...category,
    expenses: rows.filter((expense) => expense.category_id === category.id),
  }));
}

export async function expenseCategorySave(period: number, body: unknown, category?: number) {
  const input = expenseCategorySchema.parse(body);
  return peopleTransaction(async (db) => {
    await openPeriod(period, db);
    if (category !== undefined) await requireCategory(period, category, db);
    const duplicate = await query(
      'SELECT id FROM period_expense_categories WHERE period_id=? AND name=? AND id<>?',
      [period, input.name, category ?? 0],
      db,
    );
    if (duplicate.length)
      throw new AppError(409, 'Ya existe una categoría con ese nombre en el período.');
    if (category !== undefined) {
      await execute(
        'UPDATE period_expense_categories SET name=? WHERE id=? AND period_id=?',
        [input.name, category, period],
        db,
      );
    } else {
      category = (
        await execute(
          'INSERT INTO period_expense_categories(period_id,name) VALUES (?,?)',
          [period, input.name],
          db,
        )
      ).insertId;
    }
    return { id: category };
  });
}

export async function expenseCategoryDelete(period: number, category: number) {
  return peopleTransaction(async (db) => {
    await openPeriod(period, db);
    await requireCategory(period, category, db);
    await execute(
      'DELETE FROM period_expense_categories WHERE id=? AND period_id=?',
      [category, period],
      db,
    );
    return { ok: true };
  });
}

export async function expenseSave(
  period: number,
  category: number,
  body: unknown,
  expense?: number,
) {
  const input = expenseSchema.parse(body);
  return peopleTransaction(async (db) => {
    const selectedPeriod = await openPeriod(period, db);
    await requireCategory(period, category, db);
    if (expense !== undefined) await requireExpense(category, expense, db);
    expenseSchemaForPeriod(
      `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}`,
    ).parse(input);
    const values = [input.concept, input.date, input.amount, input.notes];
    if (expense !== undefined) {
      await execute(
        'UPDATE period_expenses SET concept=?,date=?,amount=?,notes=? WHERE id=? AND category_id=?',
        [...values, expense, category],
        db,
      );
    } else {
      expense = (
        await execute(
          'INSERT INTO period_expenses(concept,date,amount,notes,category_id) VALUES (?,?,?,?,?)',
          [...values, category],
          db,
        )
      ).insertId;
    }
    return { id: expense };
  });
}

export async function expenseDelete(period: number, category: number, expense: number) {
  return peopleTransaction(async (db) => {
    await openPeriod(period, db);
    await requireCategory(period, category, db);
    await requireExpense(category, expense, db);
    await execute(
      'DELETE FROM period_expenses WHERE id=? AND category_id=?',
      [expense, category],
      db,
    );
    return { ok: true };
  });
}

export const expenses = Router();
const base = '/periods/:periodId/expense-categories';
const id = (value: unknown) => positiveId.parse(value);
expenses.get(base, async (req, res) => res.json(await expenseCategories(id(req.params.periodId))));
expenses.post(base, async (req, res) =>
  res.status(201).json(await expenseCategorySave(id(req.params.periodId), req.body)),
);
expenses.put(`${base}/:categoryId`, async (req, res) =>
  res.json(await expenseCategorySave(id(req.params.periodId), req.body, id(req.params.categoryId))),
);
expenses.delete(`${base}/:categoryId`, async (req, res) =>
  res.json(await expenseCategoryDelete(id(req.params.periodId), id(req.params.categoryId))),
);
expenses.post(`${base}/:categoryId/expenses`, async (req, res) =>
  res
    .status(201)
    .json(await expenseSave(id(req.params.periodId), id(req.params.categoryId), req.body)),
);
expenses.put(`${base}/:categoryId/expenses/:expenseId`, async (req, res) =>
  res.json(
    await expenseSave(
      id(req.params.periodId),
      id(req.params.categoryId),
      req.body,
      id(req.params.expenseId),
    ),
  ),
);
expenses.delete(`${base}/:categoryId/expenses/:expenseId`, async (req, res) =>
  res.json(
    await expenseDelete(
      id(req.params.periodId),
      id(req.params.categoryId),
      id(req.params.expenseId),
    ),
  ),
);
