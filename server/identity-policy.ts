import { query, transaction, type Connection } from './db.js';
import { AppError } from './errors.js';
import type { PoolConnection } from 'mysql2/promise';

export interface Institution {
  initialized: number;
  legacy_retired: number;
  admin_one: string | null;
  admin_two: string | null;
}
export async function lockInstitution(db: Connection): Promise<Institution | undefined> {
  // Preserve 017-only internal callers. No HTTP flow depends on this module.
  const [migration] = await query(
    "SELECT name FROM schema_migrations WHERE name='018.sql'",
    [],
    db,
  );
  if (!migration) return undefined;
  const [state] = await query<Institution>(
    'SELECT initialized,legacy_retired,admin_one,admin_two FROM identity_institution WHERE id=1 FOR UPDATE',
    [],
    db,
  );
  if (!state) throw new AppError(503, 'Estado institucional incompleto.');
  return state;
}
export async function activeAdministrators(db: Connection) {
  // Current reads: avoid stale REPEATABLE READ snapshots after waiting for lock.
  return query<{ id: string }>(
    `SELECT u.id FROM identity_users u
    JOIN identity_user_roles r ON r.user_id=u.id AND r.role='admin'
    JOIN identity_external_accounts e ON e.user_id=u.id AND e.provider='google'
    WHERE u.status='enabled' FOR UPDATE`,
    [],
    db,
  );
}
export function identityMutation<T>(fn: (db: PoolConnection) => Promise<T>) {
  return transaction(async (db) => {
    const institution = await lockInstitution(db);
    const result = await fn(db);
    if (institution?.initialized && !(await activeAdministrators(db)).length)
      throw new AppError(409, 'Debe conservarse un administrador habilitado y vinculado.');
    return result;
  });
}
