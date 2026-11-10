// Shared by the test driver boundary and the explicit QA deletion tool.
// Provisioning is deliberately external: a test must never accredit its own target.
export type SafetyEnvironment = Record<string, string | undefined>;
export function disposableDatabase(env: SafetyEnvironment = process.env) {
  const name = env.DB_NAME || '';
  if (
    ['prisma_dev', 'prisma_demo', 'prisma_test', 'prisma_qa_events_102_20261106'].includes(
      name.toLowerCase(),
    ) ||
    !/^prisma_disposable_[a-z0-9_]{1,40}$/.test(name)
  )
    throw new Error('DB safety: protected or non-disposable database');
  return name;
}

export function requireDestructiveAuthorization(env: SafetyEnvironment = process.env) {
  const database = disposableDatabase(env);
  if (env.ALLOW_DESTRUCTIVE_DB_TESTS !== 'destroy-disposable-only')
    throw new Error('DB safety: explicit destructive authorization required');
  if (
    !/^[a-f0-9-]{36}$/.test(env.TEST_DB_SERVER_UUID || '') ||
    !/^[a-f0-9]{64}$/.test(env.TEST_DB_DISPOSABLE_TOKEN || '')
  )
    throw new Error('DB safety: disposable accreditation required');
  return database;
}

// The caller supplies a reader bound to the SAME connection used for mutations.
export async function assertDisposableConnection(
  read: (sql: string) => Promise<any[]>,
  env: SafetyEnvironment = process.env,
) {
  const database = requireDestructiveAuthorization(env);
  const rows = await read('SELECT DATABASE() db, @@server_uuid server_uuid');
  if (
    rows.length !== 1 ||
    rows[0].db !== database ||
    rows[0].server_uuid !== env.TEST_DB_SERVER_UUID
  )
    throw new Error('DB safety: effective connection differs from accredited destination');
  // Exact schema, independent of schema_migrations; reset fixtures retain this table.
  const marker = await read('SELECT token, server_uuid FROM prisma_test_disposable_marker');
  if (
    marker.length !== 1 ||
    marker[0].token !== env.TEST_DB_DISPOSABLE_TOKEN ||
    marker[0].server_uuid !== rows[0].server_uuid
  )
    throw new Error('DB safety: destination is not accredited as disposable');
}
