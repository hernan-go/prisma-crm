import { query, type Connection } from './db.js';
import { AppError } from './errors.js';

// Schema 013 remains usable. Once event migrations start, all three are required
// before serving financial results; never silently omit partially enabled events.
export async function eventSchemaReady(db: Connection) {
  const rows = await query<{ name: string }>(
    "SELECT name FROM schema_migrations WHERE name IN ('014.sql','015.sql','016.sql')",
    [],
    db,
  );
  const names = new Set(rows.map((r) => r.name));
  if (!names.size) return false;
  if (names.size !== 3)
    throw new AppError(503, 'Esquema de Eventos incompleto: se requieren 014, 015 y 016.');
  return true;
}
