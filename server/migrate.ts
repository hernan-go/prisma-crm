import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from './db.js';
export async function migrate() {
  const c = await pool.getConnection();
  try {
    const [lock] = await c.query("SELECT GET_LOCK('prisma_migrate',30) acquired");
    if (!(lock as any)[0].acquired) throw new Error('No se obtuvo el bloqueo de migración.');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
    );
    for (const name of (await readdir(resolve('server/migrations')))
      .filter((x) => x.endsWith('.sql'))
      .sort()) {
      const [found] = await c.execute('SELECT name FROM schema_migrations WHERE name=?', [name]);
      if ((found as any[]).length) continue;
      const sql = await readFile(resolve('server/migrations', name), 'utf8');
      for (const statement of sql.split(';').filter((x) => x.trim())) await c.query(statement);
      await c.execute('INSERT INTO schema_migrations(name) VALUES (?)', [name]);
      console.log('Migración aplicada:', name);
    }
  } finally {
    await c.query("SELECT RELEASE_LOCK('prisma_migrate')");
    c.release();
  }
}
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  try {
    await migrate();
  } finally {
    await pool.end();
  }
}
