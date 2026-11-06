import { eventSchemaReady } from './event-schema.js';
import { query, type Connection } from './db.js';

// Preserve deployments/fixtures that have not activated 014 yet.
export async function periodHasEvents(period: number, db: Connection) {
  if (!(await eventSchemaReady(db))) return false;
  const [state] = await query<{ event_sequence: number }>(
    'SELECT event_sequence FROM periods WHERE id=? FOR UPDATE',
    [period],
    db,
  );
  if (state?.event_sequence) return true;
  return (
    (
      await query(
        'SELECT id FROM special_events WHERE period_id=? LIMIT 1 FOR UPDATE',
        [period],
        db,
      )
    ).length > 0
  );
}
