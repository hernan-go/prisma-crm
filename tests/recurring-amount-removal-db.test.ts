import { afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { pool, query, execute } from '../server/db';
import { recurringSave, recurringTiles, recurringSnapshot } from '../server/recurring-expenses';
import { statisticsExpenseBreakdown } from '../server/statistics/index';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';

import { initializeRecurringPeriod } from '../server/recurring-periods';
afterAll(() => pool.end());
const enabled = process.env.RUN_RECURRING_REMOVAL_DB_TESTS === 'true';

it.skipIf(!enabled)(
  'MySQL prisma_test: quitar importe solo del movimiento confirmado y conciliar Estadísticas',
  async () => {
    if (
      process.env.DB_NAME !== 'prisma_test' ||
      !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '127.0.0.1')
    )
      throw Error('Solo se permite prisma_test local');
    expect((await query<{ db: string }>('SELECT DATABASE() db'))[0].db).toBe('prisma_test');
    expect(await query("SELECT name FROM schema_migrations WHERE name='010.sql'")).toHaveLength(1);

    const [free] = await query<{ year: number }>(
      `SELECT y.year FROM (SELECT 2090 year UNION SELECT 2089 UNION SELECT 2088 UNION SELECT 2087 UNION SELECT 2086) y
     WHERE NOT EXISTS(SELECT 1 FROM periods p WHERE p.year=y.year) LIMIT 1`,
    );
    if (!free) throw Error('No hay un año libre reservado para esta prueba.');
    const year = free.year;
    const periods: number[] = [];
    let conceptId = 0;
    try {
      for (const month of [1, 2, 3]) {
        periods.push(
          (
            await execute("INSERT INTO periods(year,month,status) VALUES (?,?,'open')", [
              year,
              month,
            ])
          ).insertId,
        );
      }
      conceptId = (
        await execute(
          'INSERT INTO expense_recurring_concepts(name,icon_name,active,sort_order) VALUES (?,?,1,10)',
          [`QA quitar importe ${year}`, 'receipt'],
        )
      ).insertId;
      for (const period of periods) {
        const db = await pool.getConnection();
        try {
          await initializeRecurringPeriod(period, db);
        } finally {
          db.release();
        }
      }
      const [jan, feb, mar] = periods;
      const input = (month: number, amount: string) => ({
        revision: '0',
        expense: {
          concept: 'QA gasto',
          date: `${year}-${String(month).padStart(2, '0')}-10`,
          amount,
          notes: 'conservar historial vecino',
        },
        expected: null,
      });
      const janExpense = await recurringSave(jan, conceptId, input(1, '100.00'));
      const febExpense = await recurringSave(feb, conceptId, input(2, '200.00'));
      const marExpense = await recurringSave(mar, conceptId, input(3, '300.00'));
      await execute("UPDATE periods SET status='closed' WHERE id=?", [mar]);

      const credentials = await testCredentials();
      const app = createApp({ ...credentials, store: memorySessions() });
      const path = `/api/periods/${jan}/recurring-expenses/${conceptId}/amount`;
      const payload = async (period: number, month: number, id: number, amount: string) => ({
        revision: (await recurringSnapshot(period)).revision,
        expected: { ...input(month, amount).expense, id },
      });
      const expected = await payload(jan, 1, janExpense.id, '100.00');
      expect((await request(app).delete(path).send(expected)).status).toBe(401);
      const agent = request.agent(app);
      expect(
        (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
      ).toBe(200);
      const response = await agent.delete(path).send(expected);
      expect(response.status).toBe(200);

      const [removed] = await query('SELECT id FROM period_expenses WHERE id=?', [janExpense.id]);
      expect(removed).toBeUndefined();
      const [preserved] = await query('SELECT id,amount,notes FROM period_expenses WHERE id=?', [
        febExpense.id,
      ]);
      expect(preserved).toMatchObject({
        id: febExpense.id,
        amount: '200.00',
        notes: 'conservar historial vecino',
      });
      await expect(
        agent
          .delete(`/api/periods/${mar}/recurring-expenses/${conceptId}/amount`)
          .send(await payload(mar, 3, marExpense.id, '300.00')),
      ).resolves.toMatchObject({ status: 409 });
      const [closedStillThere] = await query('SELECT id FROM period_expenses WHERE id=?', [
        marExpense.id,
      ]);
      expect(closedStillThere).toBeDefined();
      const janTile = (await recurringTiles(jan)).find((tile) => tile.id === conceptId);
      expect(janTile).toMatchObject({
        amount: null,
        status: 'missing',
        category_id: expect.any(Number),
      });
      expect((await recurringTiles(feb)).find((tile) => tile.id === conceptId)?.amount).toBe(
        '200.00',
      );
      const febTile = (await recurringTiles(feb)).find((tile) => tile.id === conceptId)!;
      await execute(
        'INSERT INTO period_expenses(category_id,concept,date,amount,notes,recurring_single) VALUES (?,?,?,?,?,0)',
        [
          febTile.category_id,
          'Legacy second record',
          `${year}-02-11`,
          '50.00',
          'must remain for review',
        ],
      );
      const blocked = await agent
        .delete(`/api/periods/${feb}/recurring-expenses/${conceptId}/amount`)
        .send(await payload(feb, 2, febExpense.id, '200.00'));
      expect(blocked.status).toBe(409);
      const breakdownResponse = await agent.get(`/api/statistics/expenses?period_id=${feb}`);
      expect(breakdownResponse.status).toBe(200);
      expect(breakdownResponse.body).toMatchObject({
        total: '250.00',
        movement_count: 2,
        recurring: { subtotal: '250.00', movement_count: 2 },
      });
      const breakdown = await statisticsExpenseBreakdown(feb);
      expect(breakdown.total).toBe('250.00');
    } finally {
      if (periods.length) {
        const marks = periods.map(() => '?').join(',');
        await execute(
          `DELETE e FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id IN (${marks})`,
          periods,
        );
        await execute(
          `DELETE FROM period_expense_categories WHERE period_id IN (${marks})`,
          periods,
        );
        await execute(
          `DELETE FROM period_recurring_concepts WHERE period_id IN (${marks})`,
          periods,
        );
        await execute(
          `DELETE FROM period_recurring_settings WHERE period_id IN (${marks})`,
          periods,
        );
        await execute(`DELETE FROM periods WHERE id IN (${marks})`, periods);
      }
      if (conceptId)
        await execute('DELETE FROM expense_recurring_concepts WHERE id=?', [conceptId]);
    }
  },
);
