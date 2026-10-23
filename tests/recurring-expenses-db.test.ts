import { afterAll, expect, it } from 'vitest';
import { pool, query, execute } from '../server/db';
import {
  configurePrismaRecurring,
  recurringCatalogue,
  recurringConceptSave,
  recurringTiles,
  recurringSave as saveWithRevision,
  recurringLink as linkWithRevision,
  recurringSnapshot,
} from '../server/recurring-expenses';
import { initializeRecurringPeriod } from '../server/recurring-periods';

// Legacy economic scenarios now submit the current monthly revision explicitly.
const recurringSave = async (period: number, concept: number, body: object) =>
  saveWithRevision(period, concept, {
    revision: (await recurringSnapshot(period)).revision,
    ...body,
  });
const recurringLink = async (period: number, concept: number, body: object, unlink = false) =>
  linkWithRevision(
    period,
    concept,
    { revision: (await recurringSnapshot(period)).revision, ...body },
    unlink,
  );
import {
  expenseCategories,
  expenseCategorySave,
  expenseCategoryDelete,
  expenseSave,
  expenseDelete,
} from '../server/expenses';
import { statisticsSummary } from '../server/statistics/index';

import request from 'supertest';
import { createApp } from '../server/app';
import { testCredentials, memorySessions } from './auth-helper';

afterAll(() => pool.end());
const enabled = process.env.RUN_RECURRING_DB_TESTS === 'true';
it.skipIf(!enabled)(
  'MySQL: catálogo, históricos, edición, concurrencia, integridad y Estadísticas',
  async () => {
    if (
      process.env.DB_NAME !== 'prisma_test' ||
      !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '127.0.0.1')
    )
      throw Error('Solo prisma_test local');
    expect((await query('SELECT DATABASE() db'))[0].db).toBe('prisma_test');
    expect(await query("SELECT name FROM schema_migrations WHERE name='010.sql'")).toHaveLength(1);
    // Fail before any writes if there is an existing catalogue: never erase installation config.
    expect(await recurringCatalogue()).toHaveLength(0);
    const [free] = await query<{ year: number }>(
      `SELECT y.year FROM (SELECT 2095 year UNION SELECT 2094 UNION SELECT 2093) y WHERE NOT EXISTS(SELECT 1 FROM periods p WHERE p.year=y.year) LIMIT 1`,
    );
    if (!free) throw Error('Sin año libre');
    const year = free.year;
    const periods: number[] = [];
    let concepts: number[] = [];
    const count = async () => ({
      categories: (await query('SELECT COUNT(*) n FROM period_expense_categories'))[0].n,
      expenses: (await query('SELECT COUNT(*) n FROM period_expenses'))[0].n,
    });
    const before = await count();
    try {
      for (const month of [1, 2, 3])
        periods.push(
          (
            await execute("INSERT INTO periods(year,month,status) VALUES (?,?,'open')", [
              year,
              month,
            ])
          ).insertId,
        );
      const [a, b, closed] = periods;
      await execute("UPDATE periods SET status='closed' WHERE id=?", [closed]);
      await expect(configurePrismaRecurring({ confirm: 'other' })).rejects.toThrow();
      await configurePrismaRecurring({ confirm: 'PRISMA' });
      const catalogue = await recurringCatalogue();
      concepts = catalogue.map((c) => c.id);
      expect(catalogue).toHaveLength(8);
      await expect(configurePrismaRecurring({ confirm: 'PRISMA' })).rejects.toMatchObject({
        status: 409,
      });
      for (const period of periods) {
        const initialization = await pool.getConnection();
        try {
          await initializeRecurringPeriod(period, initialization);
        } finally {
          initialization.release();
        }
        const tiles = await recurringTiles(period);
        expect(tiles).toHaveLength(8);
        expect(tiles.every((t) => t.amount === null && t.status === 'missing')).toBe(true);
      }
      expect(await count()).toEqual(before); // Reads/preset never create monthly rows.
      const credentials = await testCredentials();
      const app = createApp({ ...credentials, store: memorySessions() });
      expect((await request(app).get(`/api/periods/${a}/recurring-expenses`)).status).toBe(401);
      const agent = request.agent(app);
      expect(
        (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
      ).toBe(200);
      expect(
        (await agent.get(`/api/periods/${closed}/recurring-expenses`)).body.tiles,
      ).toHaveLength(8);
      expect(
        (
          await agent
            .post('/api/expense-recurring-concepts/prisma-preset')
            .send({ confirm: 'PRISMA' })
        ).status,
      ).toBe(409);
      const [rent, power, gas, internet, water] = concepts;
      const first = {
        concept: 'Alquiler original',
        amount: '505000.00',
        date: `${year}-01-10`,
        notes: 'Conservar nota',
      };
      const saved = await recurringSave(a, rent, { expense: first, expected: null });
      expect(await recurringSave(a, rent, { expense: first, expected: null })).toEqual(saved);
      const changed = { ...first, amount: '525000.00' };
      expect(
        await recurringSave(a, rent, { expense: changed, expected: { ...first, id: saved.id } }),
      ).toEqual(saved);
      const [row] = await query('SELECT * FROM period_expenses WHERE id=?', [saved.id]);
      expect(row).toMatchObject({
        amount: '525000.00',
        date: first.date,
        notes: first.notes,
        concept: first.concept,
        recurring_single: 1,
      });
      expect((await recurringTiles(b))[0].amount).toBeNull();
      await expect(
        recurringSave(a, rent, { expense: first, expected: { ...first, id: saved.id } }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        recurringSave(a, rent, { expense: first, expected: null }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(recurringSave(b, rent, { expense: first, expected: null })).rejects.toThrow();
      await expect(
        recurringSave(closed, rent, {
          expense: { ...first, date: `${year}-03-10` },
          expected: null,
        }),
      ).rejects.toMatchObject({ status: 409 });
      const parallel = await Promise.allSettled(
        [600, 700].map((amount) =>
          recurringSave(a, power, {
            expense: { ...first, amount: String(amount) },
            expected: null,
          }),
        ),
      );
      expect(parallel.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(parallel.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const retry = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          recurringSave(a, gas, { expense: { ...first, amount: '35.50' }, expected: null }),
        ),
      );
      expect(retry.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(retry.filter((r) => r.status === 'rejected')).toHaveLength(3);
      const tile = (await recurringTiles(a)).find((t) => t.id === rent)!;
      // Every legacy route is blocked for linked categories.
      await expect(expenseSave(a, tile.category_id!, first)).rejects.toMatchObject({ status: 409 });
      await expect(expenseSave(a, tile.category_id!, first, saved.id)).rejects.toMatchObject({
        status: 409,
      });
      await expect(expenseDelete(a, tile.category_id!, saved.id)).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        expenseCategorySave(a, { name: 'Otro' }, tile.category_id!),
      ).rejects.toMatchObject({ status: 409 });
      await expect(expenseCategoryDelete(a, tile.category_id!)).rejects.toMatchObject({
        status: 409,
      });
      expect(
        (
          await agent
            .post(`/api/periods/${a}/expense-categories/${tile.category_id}/expenses`)
            .send(first)
        ).status,
      ).toBe(409);
      expect(
        (
          await agent
            .put(`/api/periods/${a}/recurring-expenses/${rent}`)
            .send({ expense: { ...changed, recurring_single: 0 }, expected: null })
        ).status,
      ).toBe(422);
      await expect(
        execute(
          'INSERT INTO period_expenses(category_id,concept,date,amount,notes,recurring_single) VALUES (?,?,?,?,?,1)',
          [tile.category_id, 'Dup', first.date, '1', ''],
        ),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(
        execute(
          'INSERT INTO period_expense_categories(period_id,name,recurring_concept_id) VALUES (?,?,?)',
          [a, 'Duplicada', rent],
        ),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(
        execute(
          'INSERT INTO period_expense_categories(period_id,name,recurring_concept_id) VALUES (?,?,?)',
          [a, 'Huérfana', 4294967295],
        ),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
      // Historical link preserves original fields and timestamps exactly.
      const historical = await expenseCategorySave(a, { name: 'Servicio histórico' });
      const legacy = await expenseSave(a, historical.id!, { ...first, amount: '89.25' });
      const [original] = await query('SELECT * FROM period_expenses WHERE id=?', [legacy.id]);
      const [originalCategory] = await query('SELECT * FROM period_expense_categories WHERE id=?', [
        historical.id,
      ]);
      await recurringLink(a, internet, { category_id: historical.id });
      const [linked] = await query('SELECT * FROM period_expenses WHERE id=?', [legacy.id]);
      expect({ ...linked, recurring_single: 0, recurring_single_category_id: null }).toEqual(
        original,
      );
      const [linkedCategory] = await query('SELECT * FROM period_expense_categories WHERE id=?', [
        historical.id,
      ]);
      expect({ ...linkedCategory, recurring_concept_id: null }).toEqual(originalCategory);
      expect((await recurringTiles(a)).find((t) => t.id === internet)?.category_name).toBe(
        'Servicio histórico',
      );
      const multiple = await expenseCategorySave(a, { name: 'Varios históricos' });
      const h1 = await expenseSave(a, multiple.id!, { ...first, amount: '12.10' });
      const h2 = await expenseSave(a, multiple.id!, { ...first, amount: '13.20' });
      const originals = await query('SELECT * FROM period_expenses WHERE id IN (?,?) ORDER BY id', [
        h1.id,
        h2.id,
      ]);
      await recurringLink(a, water, { category_id: multiple.id });
      // Valid legacy zero remains distinct from a missing monthly record.
      const zeroCategory = await expenseCategorySave(a, { name: 'Cero histórico QA' });
      const [availableLegacy] = await query(
        'SELECT COALESCE(MAX(legacy_advertising_id),0)+1 id FROM period_expenses',
      );
      const zeroId = (
        await execute(
          'INSERT INTO period_expenses(category_id,concept,date,amount,notes,legacy_advertising_id) VALUES (?,?,?,0,?,?)',
          [zeroCategory.id, 'Cero histórico', first.date, 'Nota cero', availableLegacy.id],
        )
      ).insertId;
      await recurringLink(a, concepts[5], { category_id: zeroCategory.id });
      expect((await recurringTiles(a)).find((t) => t.id === concepts[5])).toMatchObject({
        status: 'single',
        amount: '0.00',
      });
      await expect(
        recurringSave(a, concepts[5], { expense: { ...first, amount: '0.00' }, expected: null }),
      ).rejects.toThrow();
      expect(
        await recurringSave(a, concepts[5], {
          expense: {
            concept: 'Cero histórico',
            date: first.date,
            amount: '1.00',
            notes: 'Nota cero',
          },
          expected: {
            id: zeroId,
            concept: 'Cero histórico',
            date: first.date,
            amount: '0.00',
            notes: 'Nota cero',
          },
        }),
      ).toEqual({ id: zeroId });
      expect((await recurringTiles(a)).find((t) => t.id === water)).toMatchObject({
        status: 'review',
        amount: '25.30',
      });
      await expect(
        recurringSave(a, water, { expense: first, expected: null }),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await query('SELECT * FROM period_expenses WHERE id IN (?,?) ORDER BY id', [h1.id, h2.id]),
      ).toEqual(originals);
      // Explicit unlink is the recovery path, without deleting or merging originals.
      await recurringLink(a, water, { category_id: multiple.id }, true);
      expect(
        (await expenseCategories(a)).find((c) => c.id === multiple.id)?.recurring_concept_id,
      ).toBeNull();
      await recurringLink(a, water, { category_id: multiple.id });
      const additional = await expenseCategorySave(a, { name: 'Publicidad QA' });
      const extra = await expenseSave(a, additional.id!, { ...first, amount: '11.11' });
      await expenseSave(a, additional.id!, { ...first, amount: '22.22' }, extra.id);
      await expenseCategorySave(a, { name: 'Publicidad conservada' }, additional.id);
      const [sum] = await query(
        'SELECT CAST(SUM(e.amount) AS CHAR) total FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=?',
        [a],
      );
      const summary = await statisticsSummary(a);
      expect(summary.metrics.expenses.value).toBe(sum.total);
      await expenseDelete(a, additional.id!, extra.id);
      await expenseCategoryDelete(a, additional.id!);
      await execute("UPDATE periods SET status='closed' WHERE id=?", [a]);
      expect(await recurringTiles(a)).toHaveLength(8);
      await expect(
        recurringLink(a, water, { category_id: multiple.id }, true),
      ).rejects.toMatchObject({ status: 409 });
      await execute("UPDATE periods SET status='open' WHERE id=?", [a]);
      await recurringConceptSave(
        { name: 'Alquiler renombrado', icon_name: 'house', active: true, sort_order: 10 },
        rent,
      );
      expect((await recurringTiles(a)).find((t) => t.id === rent)?.category_name).toBe('Alquiler');
      await recurringConceptSave(
        { name: 'Alquiler renombrado', icon_name: 'house', active: false, sort_order: 10 },
        rent,
      );
      expect((await recurringTiles(a)).some((t) => t.id === rent)).toBe(true);
      expect((await recurringTiles(b)).some((t) => t.id === rent)).toBe(true);
    } finally {
      // Only IDs allocated by this fixture; no truncates, no unrelated rows.
      for (const period of periods) {
        await execute('DELETE FROM period_expense_categories WHERE period_id=?', [period]);
        await execute('DELETE FROM period_recurring_concepts WHERE period_id=?', [period]);
        await execute('DELETE FROM period_recurring_settings WHERE period_id=?', [period]);
        await execute('DELETE FROM periods WHERE id=?', [period]);
      }
      for (const id of concepts)
        await execute('DELETE FROM expense_recurring_concepts WHERE id=?', [id]);
    }
    expect(await count()).toEqual(before);
  },
  30000,
);
