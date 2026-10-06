import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from './db.js';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

async function requireHistoricalExpensePeriods(c: PoolConnection) {
  const [orphans] = await c.query<RowDataPacket[]>(
    `SELECT a.id,a.date FROM advertising_investments a
     WHERE NOT EXISTS (SELECT 1 FROM periods p WHERE p.year=YEAR(a.date) AND p.month=MONTH(a.date))
     ORDER BY a.id`,
  );
  if (orphans.length)
    throw new Error(
      `007.sql detenida: ${orphans.length} registro(s) histórico(s) de publicidad sin período existente. ` +
        `IDs y fechas: ${orphans.map((row) => `${row.id} (${row.date})`).join(', ')}. ` +
        'No se crearon períodos ni se modificaron los históricos. Revisá estos registros antes de reintentar.',
    );
}

export async function migrate(through?: string) {
  const c = await pool.getConnection();
  try {
    const [lock] = await c.query("SELECT GET_LOCK('prisma_migrate',30) acquired");
    if (!(lock as any)[0].acquired) throw new Error('No se obtuvo el bloqueo de migración.');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
    );
    for (const name of (await readdir(resolve('server/migrations')))
      .filter((x) => x.endsWith('.sql') && (!through || x <= through))
      .sort()) {
      const [found] = await c.execute('SELECT name FROM schema_migrations WHERE name=?', [name]);
      if ((found as any[]).length) continue;
      // MySQL DDL commits implicitly: reject orphaned history before any 007 statement.
      if (name === '007.sql') await requireHistoricalExpensePeriods(c);
      const sql = await readFile(resolve('server/migrations', name), 'utf8');
      for (const statement of sql.split(';').filter((x) => x.trim())) {
        if (name === '007.sql' && statement.trim().toUpperCase() === 'COMMIT')
          await requireHistoricalExpensePeriods(c);
        await c.query(statement);
      }
      await c.execute('INSERT INTO schema_migrations(name) VALUES (?)', [name]);
      console.log('Migración aplicada:', name);
    }
  } catch (error) {
    await c.rollback();
    throw error;
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
