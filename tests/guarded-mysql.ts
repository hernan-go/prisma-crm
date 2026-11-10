import {
  assertDisposableConnection,
  requireDestructiveAuthorization,
} from '../server/disposable-database';

export async function guardConnection(connection: any) {
  try {
    await assertDisposableConnection(async (sql) => (await connection.query(sql))[0]);
    return connection;
  } catch (error) {
    // Destroy, rather than release, a connection which failed accreditation.
    connection.destroy();
    throw error;
  }
}

export function guardPool(pool: any) {
  const getConnection = pool.getConnection.bind(pool);
  pool.getConnection = async () => {
    requireDestructiveAuthorization(); // Reject BEFORE opening a network connection.
    return guardConnection(await getConnection());
  };
  for (const method of ['query', 'execute']) {
    pool[method] = async (...args: any[]) => {
      const connection = await pool.getConnection();
      try {
        return await connection[method](...args);
      } finally {
        connection.release();
      }
    };
  }
  return pool;
}
