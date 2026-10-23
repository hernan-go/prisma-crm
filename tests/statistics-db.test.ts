import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool, query, execute } from '../server/db';
import { readSummary, statisticsSummary } from '../server/statistics/index';

// Separate opt-in: the legacy integration suite migrates/resets its schema.
const enabled = process.env.RUN_STATISTICS_DB_TESTS === 'true';
afterAll(() => pool.end());
it.skipIf(!enabled)(
  'MySQL: aislamiento económico, históricos, joins y reconciliación; rollback de fixtures',
  async () => {
    if (
      process.env.DB_NAME !== 'prisma_test' ||
      !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '127.0.0.1')
    )
      throw Error('Solo prisma_test local');
    const db = await pool.getConnection();
    let started = false;
    try {
      const [destination] = await query<{ db: string }>('SELECT DATABASE() db', [], db);
      if (destination.db !== 'prisma_test') throw Error('Destino inseguro');
      // No migrations, DDL, truncates or changes to existing business rows.
      await db.beginTransaction();
      started = true;
      const insert = async (sql: string, values: unknown[] = []) =>
        (await execute(sql, values, db)).insertId;
      const tag = randomUUID();
      const [available] = await query<{ year: number }>(
        `SELECT y.year FROM (
      SELECT 2099 year UNION SELECT 2098 UNION SELECT 2097 UNION SELECT 2096
    ) y WHERE NOT EXISTS (SELECT 1 FROM periods p WHERE p.year=y.year) LIMIT 1`,
        [],
        db,
      );
      if (!available) throw Error('Sin año libre para fixtures');
      const year = available.year;
      const a = await insert("INSERT INTO periods(year,month,status) VALUES (?,1,'open')", [year]);
      const b = await insert("INSERT INTO periods(year,month,status) VALUES (?,2,'closed')", [
        year,
      ]);
      const empty = await insert("INSERT INTO periods(year,month,status) VALUES (?,3,'closed')", [
        year,
      ]);
      const person =
        await insert(`INSERT INTO people(nombre,apellido,telefono,phone_normalized,direccion,observaciones,emergency_name,emergency_relationship,emergency_phone,emergency_notes,activo)
      VALUES ('QA','Statistics','','','','','','','','',0)`);
      const person2 =
        await insert(`INSERT INTO people(nombre,apellido,telefono,phone_normalized,direccion,observaciones,emergency_name,emergency_relationship,emergency_phone,emergency_notes)
      VALUES ('QA','Statistics 2','','','','','','','','')`);
      for (const period of [a, b])
        await insert('INSERT INTO period_memberships(person_id,period_id) VALUES (?,?),(?,?)', [
          person,
          period,
          person2,
          period,
        ]);
      const accountA = await insert(
        'INSERT INTO monthly_accounts(person_id,period_id,amount_due) VALUES (?,?,100.10)',
        [person, a],
      );
      const accountB = await insert(
        'INSERT INTO monthly_accounts(person_id,period_id,amount_due) VALUES (?,?,0)',
        [person, b],
      );
      await insert(
        'INSERT INTO monthly_accounts(person_id,period_id,amount_due) VALUES (?,?,NULL)',
        [person2, b],
      );
      for (const [account, date, amount] of [
        [accountA, `${year}-02-10`, '20.00'],
        [accountA, `${year}-03-10`, '30.05'],
        [accountB, `${year}-01-10`, '8.00'],
      ] as const)
        await insert(
          "INSERT INTO payments(account_id,date,amount,method,recipient,notes) VALUES (?,?,?,'cash','hernan','')",
          [account, date, amount],
        );
      const activity = await insert('INSERT INTO activities(name) VALUES (?)', [`QA ${tag}`]);
      const offering = await insert(
        "INSERT INTO period_activities(period_id,activity_id,name,mode) VALUES (?,?,'QA','group')",
        [a, activity],
      );
      const instructor = await insert('INSERT INTO instructors(name) VALUES (?)', [`QA ${tag}`]);
      const historic = await insert(
        "INSERT INTO instructors(name,active) VALUES ('QA historic',0)",
      );
      const undefinedInstructor = await insert(
        "INSERT INTO instructors(name) VALUES ('QA undefined')",
      );
      const enrollment = await insert(
        'INSERT INTO enrollments(person_id,period_id,activity_id) VALUES (?,?,?)',
        [person, a, activity],
      );
      for (const day of [1, 2]) {
        const schedule = await insert(
          "INSERT INTO activity_schedules(offering_id,day,start,end) VALUES (?,?,'10:00','11:00')",
          [offering, day],
        );
        await insert(
          "INSERT INTO schedule_instructors(schedule_id,instructor_id,display_name) VALUES (?,?,'QA'),(?,?,'QA undefined')",
          [schedule, instructor, schedule, undefinedInstructor],
        );
        await insert(
          "INSERT INTO enrollment_slots(enrollment_id,schedule_id,day,start,end) VALUES (?,?,?,'10:00','11:00')",
          [enrollment, schedule, day],
        );
      }
      const fee = await insert(
        "INSERT INTO facilitator_accounts(offering_id,instructor_id,amount_due,notes) VALUES (?,?,60.00,'')",
        [offering, instructor],
      );
      await insert(
        "INSERT INTO facilitator_accounts(offering_id,instructor_id,amount_due,notes) VALUES (?,?,NULL,'')",
        [offering, historic],
      );
      for (const amount of ['40.00', '30.00'])
        await insert(
          "INSERT INTO facilitator_payments(account_id,date,amount,notes) VALUES (?,?,?,'')",
          [fee, `${year}-02-12`, amount],
        );
      const category = await insert(
        "INSERT INTO period_expense_categories(period_id,name) VALUES (?,'QA')",
        [a],
      );
      await insert(
        "INSERT INTO period_expenses(category_id,concept,date,amount,notes) VALUES (?,'QA',?,0.10,''),(?,'QA',?,0.20,'')",
        [category, `${year}-01-01`, category, `${year}-01-02`],
      );
      const snapshot = '2026-10-22T15:00:00.000Z';
      const first = await readSummary(a, db, snapshot);
      expect(first.metrics.due).toMatchObject({ value: '100.10', missing: 1, universe: 2 });
      expect(first.metrics.collected.value).toBe('50.05');
      expect(first.metrics.debt.value).toBe('50.05');
      expect(first.metrics.fees_committed).toMatchObject({
        value: '60.00',
        universe: 3,
        missing: 1,
        undefined: 1,
      });
      expect(first.metrics.fees_paid.value).toBe('70.00');
      expect(first.fees_overpaid).toEqual({ count: 1, excess: '10.00' });
      expect(first.metrics.expenses.value).toBe('0.30');
      const second = await readSummary(b, db, snapshot);
      expect(second.period.status).toBe('closed');
      expect(second.metrics.collected.value).toBe('8.00');
      expect(second.metrics.credit.value).toBe('8.00');
      expect(second.metrics.due).toMatchObject({ value: '0.00', defined: 1, undefined: 1 });
      expect((await readSummary(empty, db, snapshot)).empty).toBe(true);
      const [dashboard] = await query<{
        due: string;
        paid: string;
        pending: string;
        credit: string;
      }>(
        `SELECT COALESCE(SUM(amount_due),0) due,COALESCE(SUM(paid),0) paid,
      COALESCE(SUM(GREATEST(amount_due-paid,0)),0) pending,COALESCE(SUM(GREATEST(paid-amount_due,0)),0) credit
      FROM (SELECT m.amount_due,COALESCE(SUM(p.amount),0) paid FROM monthly_accounts m
      LEFT JOIN payments p ON p.account_id=m.id WHERE m.period_id=? GROUP BY m.id) balances`,
        [a],
        db,
      );
      expect([
        first.metrics.due.value,
        first.metrics.collected.value,
        first.metrics.debt.value,
        first.metrics.credit.value,
      ]).toEqual([dashboard.due, dashboard.paid, dashboard.pending, dashboard.credit]);
      await db.rollback();
      started = false;
      expect(
        await query('SELECT id FROM periods WHERE id IN (?,?,?)', [a, b, empty], db),
      ).toHaveLength(0);
      // Exercises real read-only snapshot syntax and pooled connection cleanup.
      await expect(statisticsSummary(a)).rejects.toMatchObject({ status: 404 });
    } finally {
      if (started) await db.rollback();
      db.release();
    }
  },
  20000,
);
