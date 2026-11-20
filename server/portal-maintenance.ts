import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { pool, query, onConnection } from './db.js';
import { parseTarget, verifyTarget } from './portal-operations.js';
import { createPortalSessionService } from './portal-sessions.js';

type Counts = {
  scanned: number;
  invalidated: number;
  purgedAttempts: number;
  purgedSessions: number;
};
export async function maintenancePasses(run: (limit: number) => Promise<Counts>) {
  const total = {
    scanned: 0,
    invalidated: 0,
    purgedAttempts: 0,
    purgedSessions: 0,
    passes: 0,
    backlog: false,
  };
  while (total.passes < 10) {
    const next = await run(100);
    total.passes++;
    total.scanned += next.scanned;
    total.invalidated += next.invalidated;
    total.purgedAttempts += next.purgedAttempts;
    total.purgedSessions += next.purgedSessions;
    if (!next.scanned) return total;
  }
  return { ...total, backlog: true };
}
export async function runMaintenance(target: ReturnType<typeof parseTarget>) {
  const db = await pool.getConnection();
  // Same physical connection owns the advisory lock and every batch transaction.
  const name = createHash('sha256')
    .update('prisma:portal:maintenance:' + target.database)
    .digest('hex');
  let locked = false;
  try {
    await verifyTarget(db, target);
    const [row] = await query('SELECT GET_LOCK(?,0) acquired', [name], db);
    if (row.acquired !== 1) throw Error('maintenance_busy');
    locked = true;
    const service = createPortalSessionService();
    return await maintenancePasses((limit) =>
      service.maintain(limit, (fn) => onConnection(db, fn)),
    );
  } finally {
    await release();
  }
  async function release() {
    try {
      if (locked) {
        const [row] = await query('SELECT RELEASE_LOCK(?) released', [name], db);
        if (row.released !== 1) throw Error('lock_release_failed');
      }
      db.release();
    } catch (e) {
      db.destroy();
      throw e;
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const start = Date.now();
  let target;
  try {
    target = parseTarget(process.argv.slice(2));
    const result = await runMaintenance(target);
    console.log(
      JSON.stringify({
        utc: new Date().toISOString(),
        target,
        durationMs: Date.now() - start,
        ...result,
      }),
    );
    if (result.backlog) process.exitCode = 2;
  } catch (e) {
    console.error(
      JSON.stringify({
        utc: new Date().toISOString(),
        target,
        durationMs: Date.now() - start,
        status: e instanceof Error && e.message === 'maintenance_busy' ? 'busy' : 'failed',
      }),
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
