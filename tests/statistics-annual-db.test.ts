import { afterAll, expect, it } from 'vitest';
import { pool, query } from '../server/db';
import { readAnnualInput } from '../server/statistics/annual';
import { calculateAnnual } from '../server/statistics/annual-engine';
import { readSummaryInput } from '../server/statistics';
import { calculateSummary } from '../server/statistics/engine';

afterAll(() => pool.end());
it.runIf(process.env.RUN_DB_TESTS === 'true')(
  'MySQL prisma_test: lectura anual concilia con el resumen mensual dentro del mismo snapshot, sin fixtures ni escrituras',
  async () => {
    expect(process.env.DB_NAME).toBe('prisma_test');
    expect(['127.0.0.1', 'localhost', '::1']).toContain(process.env.DB_HOST || '127.0.0.1');
    const db = await pool.getConnection();
    try {
      const [identity] = await query<{ name: string }>('SELECT DATABASE() name', [], db);
      expect(identity.name).toBe('prisma_test');
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const [latest] = await query<{ year: number }>(
        'SELECT p.year FROM periods p LEFT JOIN period_memberships m ON m.period_id=p.id GROUP BY p.year ORDER BY COUNT(m.person_id) DESC,p.year DESC LIMIT 1',
        [],
        db,
      );
      const year = latest?.year ?? 2026;
      const input = await readAnnualInput(year, db);
      const at = new Date().toISOString();
      const annual = calculateAnnual(year, input, at);
      for (const month of annual.months.filter((row) => row.period)) {
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
);
