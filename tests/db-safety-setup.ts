import { vi } from 'vitest';

// Intercept the real driver, including pool operations used by migrations,
// app routes, transactions and afterAll cleanup. Unit mocks never open MySQL.
vi.mock('mysql2/promise', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mysql2/promise')>();
  const { guardPool, guardConnection } = await import('./guarded-mysql');
  const { requireDestructiveAuthorization } = await import('../server/disposable-database');
  const createPool = (...args: Parameters<typeof actual.createPool>) =>
    guardPool(actual.createPool(...args));
  const createConnection = async (...args: Parameters<typeof actual.createConnection>) => {
    requireDestructiveAuthorization();
    return guardConnection(await actual.createConnection(...args));
  };
  return {
    ...actual,
    createPool,
    createConnection,
    default: { ...actual, createPool, createConnection },
  };
});
