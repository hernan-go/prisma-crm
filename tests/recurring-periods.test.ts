import { expect, it, vi } from 'vitest';
vi.mock('../server/db', () => ({ query: vi.fn(), execute: vi.fn() }));
import { query, execute } from '../server/db';
import { requireRecurringSchema, initializeRecurringPeriod } from '../server/recurring-periods';
import type { Connection } from '../server/db';
it('sin 011 devuelve 503 y nunca inicializa configuración por fallback', async () => {
  vi.mocked(query).mockResolvedValue([]);
  await expect(requireRecurringSchema()).rejects.toMatchObject({ status: 503 });
  await expect(initializeRecurringPeriod(1, {} as Connection)).rejects.toMatchObject({
    status: 503,
  });
  expect(execute).not.toHaveBeenCalled();
});
