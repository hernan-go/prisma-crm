import { beforeEach, expect, it, vi } from 'vitest';
import { scheduleSave } from '../server/offerings';
import { execute, query } from '../server/db';

// Exercise the actual history guard with synthetic reads and no database connection.
vi.mock('../server/db', () => ({
  query: vi.fn(),
  execute: vi.fn(),
  pool: {},
  peopleTransaction: (run: (db: object) => Promise<unknown>) => run({}),
}));
vi.mock('../server/scheduling', () => ({ openPeriod: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
it.each([
  ['media hora', '18:00', '19:00'],
  ['cuarto de hora', '18:15', '19:15'],
])(
  'protege un horario utilizado de %s frente a cambios de día, horas o facilitadores',
  async (_label, start, end) => {
    const old = { id: 7, offering_id: 3, ever_used: 1, day: 1, start, end };
    vi.mocked(query).mockImplementation(async (sql) => {
      if (sql.includes('WHERE o.id=?')) return [{ id: 3, period_id: 1 }];
      if (sql.includes('SELECT s.*')) return [old];
      if (sql.includes('SELECT si.schedule_id')) return [{ schedule_id: 7, id: 2 }];
      throw new Error(`Unexpected query: ${sql}`);
    });
    const body = { offering_id: 3, day: 1, start, end, instructor_ids: [2] };
    for (const change of [
      { day: 2 },
      { start: '18:30' },
      { end: '19:30' },
      { instructor_ids: [3] },
    ]) {
      await expect(scheduleSave({ ...body, ...change }, 7)).rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('Horario utilizado'),
      });
    }
    expect(execute).not.toHaveBeenCalled();
    expect(old).toEqual({ id: 7, offering_id: 3, ever_used: 1, day: 1, start, end });
  },
);
