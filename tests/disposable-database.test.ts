import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertDisposableConnection,
  requireDestructiveAuthorization,
} from '../server/disposable-database';
import { guardPool } from './guarded-mysql';

const env = {
  DB_NAME: 'prisma_disposable_ci',
  ALLOW_DESTRUCTIVE_DB_TESTS: 'destroy-disposable-only',
  TEST_DB_SERVER_UUID: '12345678-1234-1234-1234-123456789abc',
  TEST_DB_DISPOSABLE_TOKEN: 'ab'.repeat(32),
};
const destination = { db: env.DB_NAME, server_uuid: env.TEST_DB_SERVER_UUID };
const marker = { token: env.TEST_DB_DISPOSABLE_TOKEN, server_uuid: env.TEST_DB_SERVER_UUID };
function reader(actual = destination, accreditation = [marker]) {
  return vi.fn(async (sql: string) => (sql.includes('DATABASE()') ? [actual] : accreditation));
}
afterEach(() => vi.unstubAllEnvs());

describe('Disposable database accreditation, without MySQL', () => {
  it.each([
    'prisma_dev',
    'prisma_demo',
    'prisma_test',
    'prisma_qa_events_102_20261106',
    'PRISMA_TEST',
    'prisma',
  ])('denies protected/non-disposable name %s even with all flags', async (DB_NAME) => {
    const read = reader();
    await expect(
      assertDisposableConnection(read, {
        ...env,
        DB_NAME,
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        RUN_DB_TESTS: 'true',
      }),
    ).rejects.toThrow('protected');
    expect(read).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'true'])(
    'denies missing/legacy authorization %s before any read',
    async (authorization) => {
      const read = reader();
      await expect(
        assertDisposableConnection(read, { ...env, ALLOW_DESTRUCTIVE_DB_TESTS: authorization }),
      ).rejects.toThrow('authorization');
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(['TEST_DB_SERVER_UUID', 'TEST_DB_DISPOSABLE_TOKEN'])(
    'requires accreditation field %s',
    (key) => {
      expect(() => requireDestructiveAuthorization({ ...env, [key]: undefined })).toThrow(
        'accreditation',
      );
    },
  );
  it.each([
    { ...destination, db: 'prisma_test' },
    { ...destination, db: 'prisma_disposable_other' },
    { ...destination, server_uuid: 'another-server' },
  ])('denies effective destination mismatch %j', async (actual) => {
    const read = reader(actual);
    await expect(assertDisposableConnection(read, env)).rejects.toThrow('effective connection');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each(
    [
      [],
      [marker, marker],
      [{ ...marker, token: 'wrong' }],
      [{ ...marker, server_uuid: 'wrong' }],
    ].map((accreditation) => ({ accreditation })),
  )('denies invalid marker %j', async ({ accreditation }) => {
    await expect(
      assertDisposableConnection(reader(destination, accreditation), env),
    ).rejects.toThrow('not accredited');
  });
  it('fails closed if marker table is missing or unreadable', async () => {
    const read = reader()
      .mockResolvedValueOnce([destination])
      .mockRejectedValueOnce(new Error('unavailable'));
    await expect(assertDisposableConnection(read, env)).rejects.toThrow('unavailable');
  });
  it('accepts CI accreditation using only reads, without relying on CI flags', async () => {
    const read = reader();
    await expect(assertDisposableConnection(read, env)).resolves.toBeUndefined();
    expect(read.mock.calls.map(([sql]) => sql)).toEqual([
      'SELECT DATABASE() db, @@server_uuid server_uuid',
      'SELECT token, server_uuid FROM prisma_test_disposable_marker',
    ]);
  });
});

describe('Driver boundary protects fixtures, migrations, transactions and cleanup', () => {
  function fakePool() {
    const read = reader();
    const connection = {
      query: vi.fn(async (sql: string) => [await read(sql)]),
      execute: vi.fn(async () => ['synthetic-result']),
      release: vi.fn(),
      destroy: vi.fn(),
    };
    const acquire = vi.fn(async () => connection);
    return { pool: guardPool({ getConnection: acquire }), acquire, connection };
  }
  it.each(['query', 'execute', 'getConnection'])(
    'blocks pool.%s without opening a socket',
    async (method) => {
      vi.stubEnv('ALLOW_DESTRUCTIVE_DB_TESTS', '');
      vi.stubEnv('DB_NAME', env.DB_NAME);
      const { pool, acquire } = fakePool();
      await expect(pool[method]('DELETE FROM people')).rejects.toThrow('authorization');
      expect(acquire).not.toHaveBeenCalled();
    },
  );
  it('checks every checkout and destroys a mismatched connection before caller SQL', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { pool, connection, acquire } = fakePool();
    await expect(pool.execute('synthetic operation')).resolves.toEqual(['synthetic-result']);
    expect(connection.release).toHaveBeenCalledOnce();
    connection.query.mockResolvedValueOnce([[{ ...destination, db: 'prisma_test' }]]);
    await expect(pool.execute('DELETE FROM people')).rejects.toThrow('effective connection');
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(connection.execute).toHaveBeenCalledOnce();
    expect(connection.destroy).toHaveBeenCalledOnce();
  });
  it('applies the configured Vitest boundary to the real driver without connecting', async () => {
    vi.stubEnv('DB_NAME', 'prisma_test');
    const mysql = await import('mysql2/promise');
    const pool = mysql.createPool({ database: 'prisma_test' });
    try {
      await expect(pool.query('DROP TABLE people')).rejects.toThrow('protected');
      await expect(mysql.createConnection({ database: 'prisma_test' })).rejects.toThrow(
        'protected',
      );
    } finally {
      await pool.end();
    }
  });
  it('blocks the manual cleanup entry point on a conserved database before parsing or connecting', async () => {
    vi.stubEnv('DB_NAME', 'prisma_test');
    const { applyCleanup } = await import('../server/qa-cleanup');
    await expect(applyCleanup({}, 'prisma_test')).rejects.toThrow('protected');
  });
});
