import { afterAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { pool, query, execute } from '../server/db';
import {
  recurringSnapshot,
  recurringMembership,
  recurringSave,
  recurringRemoveAmount,
  recurringLink,
  recurringConceptSave,
} from '../server/recurring-expenses';
import { periodCreate, periodEdit } from '../server/scheduling';
import { statisticsExpenseBreakdown, statisticsSummary } from '../server/statistics/index';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';
const enabled = process.env.RUN_RECURRING_PERIOD_DB_TESTS === 'true';
afterAll(() => pool.end());
async function safe() {
  if (
    process.env.DB_NAME !== 'prisma_test' ||
    !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '127.0.0.1')
  )
    throw Error('Only local prisma_test');
  expect((await query('SELECT DATABASE() db'))[0].db).toBe('prisma_test');
  expect(await query("SELECT name FROM schema_migrations WHERE name='011.sql'")).toHaveLength(1);
}
const expected = (e: any) => ({
  id: e.id,
  concept: e.concept,
  date: e.date,
  amount: e.amount,
  notes: e.notes,
});

it.skipIf(!enabled || process.env.RUN_RECURRING_MIGRATION_REPLAY_TESTS !== 'true')(
  '011: backfill activo/inactivo, cerrado e integridad económica con rollback',
  async () => {
    await safe();
    const c = await pool.getConnection();
    try {
      const [available]: any = await c.query('SELECT id FROM periods WHERE year=2099');
      if (available.length) throw Error('Reserved fixture year occupied');
      await c.beginTransaction();
      const [p]: any = await c.query(
        "INSERT INTO periods(year,month,status) VALUES (2099,1,'closed')",
      );
      const concepts: number[] = [];
      for (const active of [1, 0, 0]) {
        const [r]: any = await c.query(
          'INSERT INTO expense_recurring_concepts(name,active) VALUES (?,?)',
          ['QA011 backfill ' + concepts.length, active],
        );
        concepts.push(r.insertId);
      }
      const [cat]: any = await c.query(
        'INSERT INTO period_expense_categories(period_id,name,recurring_concept_id) VALUES (?,?,?)',
        [p.insertId, 'QA011 historical', concepts[1]],
      );
      await c.query(
        "INSERT INTO period_expenses(category_id,concept,date,amount,notes) VALUES (?,'Historical','2099-01-15',123.45,'Original')",
        [cat.insertId],
      );
      const [before]: any = await c.query('SELECT * FROM period_expenses WHERE category_id=?', [
        cat.insertId,
      ]);
      const sql = await readFile('server/migrations/011.sql', 'utf8');
      await c.query('SET @run_recurring_011=1');
      for (const statement of sql.split(';').filter((x) => x.trim())) {
        if (
          statement.includes('CREATE TABLE IF NOT EXISTS') ||
          statement.includes('SET @run_recurring_011') ||
          ['START TRANSACTION', 'COMMIT'].includes(statement.trim())
        )
          continue;
        await c.query(statement);
      }
      const [rows]: any = await c.query(
        'SELECT recurring_concept_id,position FROM period_recurring_concepts WHERE period_id=? ORDER BY position',
        [p.insertId],
      );
      expect(
        rows
          .filter((r: any) => concepts.includes(r.recurring_concept_id))
          .map((r: any) => r.recurring_concept_id),
      ).toEqual(concepts.slice(0, 2));
      expect(rows.map((r: any) => r.position)).toEqual(rows.map((_: any, i: number) => i + 1));
      expect(
        (await c.query('SELECT * FROM period_expenses WHERE category_id=?', [cat.insertId]))[0],
      ).toEqual(before);
      expect((await c.query('SELECT status FROM periods WHERE id=?', [p.insertId]))[0]).toEqual([
        { status: 'closed' },
      ]);
    } finally {
      await c.rollback();
      await c.query('DROP TEMPORARY TABLE IF EXISTS recurring_011_guard');
      await c.query('DROP TEMPORARY TABLE IF EXISTS recurring_011_expected');
      c.release();
    }
  },
  30000,
);

it.skipIf(!enabled)(
  '011: independencia, orden, revisión, eliminación, concurrencia, HTTP y Estadísticas',
  async () => {
    await safe();
    const periods: number[] = [],
      concepts: number[] = [];
    const [free] = await query<{ year: number }>(
      'SELECT y.year FROM (SELECT 2097 year UNION SELECT 2096 UNION SELECT 2085) y WHERE NOT EXISTS(SELECT 1 FROM periods p WHERE p.year=y.year) LIMIT 1',
    );
    if (!free) throw Error('No free fixture year');
    const year = free.year;
    try {
      for (let i = 0; i < 3; i++)
        concepts.push(
          (
            await recurringConceptSave({
              name: 'QA011 concept ' + i,
              icon_name: 'receipt',
              active: i < 2,
            })
          ).id!,
        );
      for (let month = 1; month <= 3; month++)
        periods.push((await periodCreate({ year, month, mode: 'empty' })).id);
      const [a, b, closed] = periods;
      const [x, y, z] = concepts;
      const snap = (p: number) => recurringSnapshot(p);
      const change = async (
        p: number,
        c: number,
        action: 'add' | 'remove' | 'position',
        extra = {},
      ) => recurringMembership(p, c, { revision: (await snap(p)).revision, ...extra }, action);
      const save = async (p: number, c: number, month: number, amount: string) =>
        recurringSave(p, c, {
          revision: (await snap(p)).revision,
          expected: null,
          expense: {
            concept: 'QA011 expense',
            date: `${year}-0${month}-10`,
            amount,
            notes: 'Original note',
          },
        });
      expect((await snap(a)).tiles.map((t) => t.id)).toContain(x);
      expect((await snap(a)).tiles.map((t) => t.id)).not.toContain(z);
      expect(
        await query('SELECT id FROM period_expense_categories WHERE period_id=?', [a]),
      ).toHaveLength(0);
      const bOriginal = await snap(b);
      await change(a, z, 'add');
      await change(a, z, 'position', { position: 1 });
      expect((await snap(a)).tiles[0].id).toBe(z);
      expect(await snap(b)).toEqual(bOriginal);
      await expect(change(a, x, 'position', { position: 99999 })).rejects.toMatchObject({
        status: 409,
      });
      await save(a, x, 1, '100.00');
      await save(b, x, 2, '200.00');
      const beforeB = await query(
        'SELECT e.* FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=?',
        [b],
      );
      const snapshot = await snap(a);
      const tile = snapshot.tiles.find((t) => t.id === x)!;
      const beforeStats = await statisticsExpenseBreakdown(a);
      // Reading/cancelling the confirmation is read-only.
      expect(await snap(a)).toEqual(snapshot);
      const credentials = await testCredentials();
      const app = createApp({ ...credentials, store: memorySessions() });
      const agent = request.agent(app);
      const path = `/api/periods/${a}/recurring-expenses/${x}/presence`;
      expect(
        (
          await request(app)
            .delete(path)
            .send({ revision: snapshot.revision, expected: expected(tile.expenses[0]) })
        ).status,
      ).toBe(401);
      expect(
        (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
      ).toBe(200);
      expect(
        (
          await agent
            .delete(path)
            .set('Origin', 'https://untrusted.invalid')
            .send({ revision: snapshot.revision, expected: expected(tile.expenses[0]) })
        ).status,
      ).toBe(403);
      expect(
        (
          await agent.delete(path).send({
            revision: snapshot.revision,
            expected: { ...expected(tile.expenses[0]), notes: 'Changed' },
          })
        ).status,
      ).toBe(409);
      const removed = await agent
        .delete(path)
        .send({ revision: snapshot.revision, expected: expected(tile.expenses[0]) });
      expect(removed.status).toBe(200);
      expect(
        (
          await agent
            .delete(path)
            .send({ revision: snapshot.revision, expected: expected(tile.expenses[0]) })
        ).status,
      ).toBe(409);
      expect((await snap(a)).tiles.some((t) => t.id === x)).toBe(false);
      expect(
        await query(
          'SELECT e.* FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=?',
          [b],
        ),
      ).toEqual(beforeB);
      expect(Number(beforeStats.total) - Number((await statisticsExpenseBreakdown(a)).total)).toBe(
        100,
      );
      // Registered SQL replay cannot resurrect the removed tile.
      if (process.env.RUN_RECURRING_MIGRATION_REPLAY_TESTS === 'true') {
        const c = await pool.getConnection();
        try {
          for (const st of (await readFile('server/migrations/011.sql', 'utf8'))
            .split(';')
            .filter((x) => x.trim()))
            await c.query(st);
        } finally {
          c.release();
        }
      }
      expect((await snap(a)).tiles.some((t) => t.id === x)).toBe(false);
      await change(a, x, 'add');
      expect((await snap(a)).tiles.find((t) => t.id === x)?.amount).toBeNull();
      await expect(
        recurringMembership(a, x, { revision: snapshot.revision, expected: null }, 'remove'),
      ).rejects.toMatchObject({ status: 409 });
      await save(a, x, 1, '150.00');
      let state = await snap(a),
        current = state.tiles.find((t) => t.id === x)!;
      await expect(
        recurringRemoveAmount(a, x, {
          revision: snapshot.revision,
          expected: expected(current.expenses[0]),
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await snap(a)).toEqual(state);
      await recurringRemoveAmount(a, x, {
        revision: state.revision,
        expected: expected(current.expenses[0]),
      });
      expect((await snap(a)).tiles.find((t) => t.id === x)?.amount).toBeNull();
      // Two requests using one revision: only one succeeds.
      state = await snap(a);
      const race = await Promise.allSettled([
        recurringMembership(a, x, { revision: state.revision, position: 1 }, 'position'),
        recurringMembership(a, y, { revision: state.revision, expected: null }, 'remove'),
      ]);
      expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      state = await snap(a);
      expect(state.tiles.map((t) => t.position)).toEqual(state.tiles.map((_, i) => i + 1));
      await execute("UPDATE periods SET status='closed' WHERE id=?", [closed]);
      await expect(change(closed, z, 'add')).rejects.toMatchObject({ status: 409 });
      await expect(change(closed, x, 'remove', { expected: null })).rejects.toMatchObject({
        status: 409,
      });
      const newConcept = (
        await recurringConceptSave({ name: 'QA011 ninth', icon_name: 'receipt', active: true })
      ).id!;
      concepts.push(newConcept);
      expect((await snap(a)).tiles.some((t) => t.id === newConcept)).toBe(false);
      await change(a, newConcept, 'add');
      const future = (await periodCreate({ year, month: 4, mode: 'clone_previous' })).id;
      periods.push(future);
      expect((await snap(future)).tiles.some((t) => t.id === newConcept)).toBe(true);
      expect(
        await query('SELECT id FROM period_expense_categories WHERE period_id=?', [future]),
      ).toHaveLength(0);
      await periodEdit(future);
      periods.splice(periods.indexOf(future), 1);
      // Multiple historical movements block removal without suppressing statistics.
      const category = (
        await execute('INSERT INTO period_expense_categories(period_id,name) VALUES (?,?)', [
          a,
          'QA011 multi',
        ])
      ).insertId;
      for (const amount of ['3.00', '4.00'])
        await execute(
          "INSERT INTO period_expenses(category_id,concept,date,amount,notes) VALUES (?,'QA011 history',?,?,'')",
          [category, `${year}-01-12`, amount],
        );
      await recurringLink(a, z, { revision: (await snap(a)).revision, category_id: category });
      await expect(change(a, z, 'remove', { expected: null })).rejects.toMatchObject({
        status: 409,
      });
      expect((await snap(a)).tiles.find((t) => t.id === z)?.amount).toBe('7.00');
      // Overflow after deletes forces rollback of movement and presence.
      await save(a, x, 1, '99.00');
      await execute(
        'UPDATE period_recurring_settings SET revision=18446744073709551615 WHERE period_id=?',
        [a],
      );
      state = await snap(a);
      current = state.tiles.find((t) => t.id === x)!;
      expect(state.revision).toBe('18446744073709551615');
      await expect(
        recurringMembership(
          a,
          x,
          { revision: state.revision, expected: expected(current.expenses[0]) },
          'remove',
        ),
      ).rejects.toBeDefined();
      expect(await snap(a)).toEqual(state);
      await execute(
        'UPDATE period_recurring_settings SET revision=9007199254740993 WHERE period_id=?',
        [a],
      );
      expect((await snap(a)).revision).toBe('9007199254740993');
      const totals = await statisticsExpenseBreakdown(a);
      expect(totals.total).toBe('106.00');
      const summary = await statisticsSummary(a);
      expect(JSON.stringify(summary)).toContain('106.00');
      await expect(
        execute(
          'INSERT INTO period_recurring_concepts(period_id,recurring_concept_id,position) VALUES (?,?,0)',
          [a, 999999999],
        ),
      ).rejects.toBeDefined();
      await expect(
        execute('DELETE FROM expense_recurring_concepts WHERE id=?', [x]),
      ).rejects.toBeDefined();
      expect(
        (
          await query('SELECT COUNT(*) count FROM period_expenses WHERE category_id=?', [category])
        )[0].count,
      ).toBe(2);
    } finally {
      for (const p of periods) {
        await execute(
          'DELETE e FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=?',
          [p],
        );
        await execute('DELETE FROM period_expense_categories WHERE period_id=?', [p]);
        await execute('DELETE FROM period_recurring_concepts WHERE period_id=?', [p]);
        await execute('DELETE FROM period_recurring_settings WHERE period_id=?', [p]);
        await execute('DELETE FROM periods WHERE id=?', [p]);
      }
      for (const c of concepts)
        await execute('DELETE FROM expense_recurring_concepts WHERE id=?', [c]);
    }
  },
  60000,
);
