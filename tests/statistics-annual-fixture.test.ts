import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  migrate: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../server/db', () => ({
  query: mocks.query,
  execute: mocks.execute,
  transaction: mocks.transaction,
}));
vi.mock('../server/migrate', () => ({ migrate: mocks.migrate }));
import { prepareAnnualFixture } from './statistics-annual-fixture';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([{ Tables: 'prisma_test_disposable_marker' }]);
  mocks.execute.mockResolvedValue({ insertId: 1 });
  mocks.transaction.mockImplementation((fn) => fn({ syntheticConnection: true }));
});

it.each(
  [
    [],
    [{ Tables: 'periods' }],
    [{ Tables: 'prisma_test_disposable_marker' }, { Tables: 'periods' }],
  ].map((tables) => ({ tables })),
)(
  'refuses an unprepared or previously used schema before migrations or writes: %j',
  async ({ tables }) => {
    mocks.query.mockResolvedValue(tables);
    await expect(prepareAnnualFixture()).rejects.toThrow('fresh accredited schema');
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  },
);

it('migrates a fresh accredited schema before preparing non-empty, transactional annual data', async () => {
  await expect(prepareAnnualFixture()).resolves.toBe(2091);
  expect(mocks.migrate).toHaveBeenCalledExactlyOnceWith('019.sql');
  expect(mocks.migrate.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.transaction.mock.invocationCallOrder[0],
  );
  const sql = mocks.execute.mock.calls.map(([statement]) => statement as string);
  for (const table of [
    'periods',
    'period_memberships',
    'enrollments',
    'monthly_accounts',
    'payments',
  ])
    expect(sql.filter((statement) => statement.startsWith(`INSERT INTO ${table}(`))).toHaveLength(
      2,
    );
  expect(sql.some((statement) => /DROP|TRUNCATE|DELETE/.test(statement))).toBe(false);
  expect(mocks.execute.mock.calls.every(([, , db]) => db.syntheticConnection === true)).toBe(true);
});
