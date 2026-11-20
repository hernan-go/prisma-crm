import { describe, expect, it, vi } from 'vitest';
import { maintenancePasses } from '../server/portal-maintenance';
import { parseTarget } from '../server/portal-operations';

const empty = { scanned: 0, invalidated: 0, purgedAttempts: 0, purgedSessions: 0 };
describe('supervised portal operations', () => {
  it('refuses an implicit or mismatched destination before opening MySQL', () => {
    expect(() => parseTarget(['localhost', '3306', 'wrong', 'bad'], {})).toThrow();
  });
  it('runs bounded batches and returns aggregate counters', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ ...empty, scanned: 2, invalidated: 2 })
      .mockResolvedValue(empty);
    expect(await maintenancePasses(run)).toEqual({
      ...empty,
      scanned: 2,
      invalidated: 2,
      passes: 2,
      backlog: false,
    });
    expect(run.mock.calls).toEqual([[100], [100]]);
  });
  it('reports possible backlog after ten nonempty passes', async () => {
    const run = vi.fn().mockResolvedValue({ ...empty, scanned: 1, purgedSessions: 1 });
    expect(await maintenancePasses(run)).toMatchObject({
      passes: 10,
      backlog: true,
      purgedSessions: 10,
    });
  });
  it('does not automatically retry a failed pass', async () => {
    const run = vi.fn().mockRejectedValue(Error('fixture'));
    await expect(maintenancePasses(run)).rejects.toThrow('fixture');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
