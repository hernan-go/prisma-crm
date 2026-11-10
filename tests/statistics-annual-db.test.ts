import { disposableDatabase } from '../server/disposable-database';
import { afterAll, expect, it } from 'vitest';
import { pool, query } from '../server/db';
import { readAnnualInput } from '../server/statistics/annual';
import { calculateAnnual } from '../server/statistics/annual-engine';
import { readSummaryInput } from '../server/statistics';
import { calculateSummary } from '../server/statistics/engine';
import { prepareAnnualFixture } from './statistics-annual-fixture';

afterAll(() => pool.end());
it.runIf(process.env.RUN_DB_TESTS === 'true')(
  'MySQL descartable: baseline propio y lectura anual concilian dentro del mismo snapshot',
  async () => {
    expect(process.env.DB_NAME).toBe(disposableDatabase());
    expect(['127.0.0.1', 'localhost', '::1']).toContain(process.env.DB_HOST || '127.0.0.1');
    const year = await prepareAnnualFixture();
    const db = await pool.getConnection();
    try {
      const [identity] = await query<{ name: string }>('SELECT DATABASE() name', [], db);
      expect(identity.name).toBe(disposableDatabase());
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const input = await readAnnualInput(year, db);
      const at = new Date().toISOString();
      const annual = calculateAnnual(year, input, at);
      expect(annual.months.filter((row) => row.period)).toHaveLength(2);
      expect(input.members).toHaveLength(2);
      expect(input.enrollments).toHaveLength(2);
      for (const month of annual.months.filter((row) => row.period)) {
        expect(month.due?.value).toBe('100.10');
        expect(month.collected?.value).toBe('25.05');
        expect(month.participants).toBe(1);
        const monthly = calculateSummary(await readSummaryInput(month.period!.id, db), at);
        expect(month.due).toEqual(monthly.metrics.due);
        expect(month.collected).toEqual(monthly.metrics.collected);
        const [people] = await query<{ count: number }>(
          'SELECT COUNT(DISTINCT person_id) count FROM enrollments WHERE period_id=?',
          [month.period!.id],
          db,
        );
        expect(month.participants).toBe(people.count);
      }
      console.info('QA anual de solo lectura', {
        year,
        periodsCompared: annual.months.filter((row) => row.period).length,
        membershipRows: input.members.length,
        enrollmentRows: input.enrollments.length,
      });
    } finally {
      await db.rollback();
      db.release();
    }
  },
  30000,
);
