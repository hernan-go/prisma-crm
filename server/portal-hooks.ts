import type { PoolConnection } from 'mysql2/promise';
import { query, execute } from './db.js';
import { portalCounter } from '../shared/portal.js';
import { AppError } from './errors.js';

interface Link {
  user_id: string;
  instructor_id: number;
  revision: string;
  min_login_seq: string;
}
// Caller holds institution (and people lock when applicable), on its active
// transaction. No transaction creation, authorization, policy activation or network.
export async function preparePortalMutation(db: PoolConnection) {
  if (!(await query("SELECT name FROM schema_migrations WHERE name='021.sql'", [], db)).length)
    return { finish: async (_forceUsers: string[] = []) => {} };
  const [state] = await query<{ revision: string; security_seq: string }>(
    'SELECT CAST(revision AS CHAR) revision,CAST(security_seq AS CHAR) security_seq FROM portal_access_state WHERE id=1 FOR UPDATE',
    [],
    db,
  );
  if (!state) throw new AppError(503, 'Estado portal incompleto.');
  const links = await query<Link>(
    'SELECT user_id,instructor_id,CAST(revision AS CHAR) revision,CAST(min_login_seq AS CHAR) min_login_seq FROM identity_instructor_links ORDER BY user_id FOR UPDATE',
    [],
    db,
  );
  async function identities() {
    const result = new Map<string, string>();
    for (const link of links) {
      const users = await query(
        'SELECT status FROM identity_users WHERE id=? FOR UPDATE',
        [link.user_id],
        db,
      );
      const roles = await query(
        'SELECT role FROM identity_user_roles WHERE user_id=? ORDER BY role FOR UPDATE',
        [link.user_id],
        db,
      );
      const google = await query(
        "SELECT subject FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
        [link.user_id],
        db,
      );
      // Internal comparison only; never persisted or logged.
      result.set(link.user_id, JSON.stringify([users, roles, google]));
    }
    return result;
  }
  const beforeUsers = await identities();
  async function instructors() {
    const result = new Map<number, string>();
    for (const id of [...new Set(links.map((l) => l.instructor_id))].sort((a, b) => a - b)) {
      result.set(
        id,
        JSON.stringify(
          await query('SELECT active FROM instructors WHERE id=? FOR UPDATE', [id], db),
        ),
      );
    }
    return result;
  }
  const beforeInstructors = await instructors();
  let finished = false;
  return {
    async finish(forceUsers: string[] = []) {
      if (finished) throw new AppError(409, 'Hook portal ya finalizado.');
      finished = true;
      const afterUsers = await identities(),
        afterInstructors = await instructors();
      const affected = links.filter(
        (l) =>
          forceUsers.includes(l.user_id) ||
          beforeUsers.get(l.user_id) !== afterUsers.get(l.user_id) ||
          beforeInstructors.get(l.instructor_id) !== afterInstructors.get(l.instructor_id),
      );
      if (!affected.length) return;
      const increment = (v: string) =>
        portalCounter.parse((BigInt(portalCounter.parse(v)) + 1n).toString());
      const revision = increment(state.revision),
        seq = increment(state.security_seq);
      await execute(
        'UPDATE portal_access_state SET revision=?,security_seq=? WHERE id=1',
        [revision, seq],
        db,
      );
      for (const link of affected) {
        await execute(
          'UPDATE identity_instructor_links SET revision=?,min_login_seq=? WHERE user_id=?',
          [increment(link.revision), seq, link.user_id],
          db,
        );
        await execute(
          "UPDATE identity_sessions SET revoked_at=GREATEST(created_at,CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)) WHERE user_id=? AND application='portal' AND revoked_at IS NULL",
          [link.user_id],
          db,
        );
        await execute(
          'INSERT INTO identity_audit_events(user_id,actor_id,event,details_json) VALUES (?,NULL,?,?)',
          [
            link.user_id,
            'portal.context.revoked',
            JSON.stringify({
              version: 1,
              source: 'eligibility_hook',
              beforeSeq: link.min_login_seq,
              minLoginSeq: seq,
              revision,
            }),
          ],
          db,
        );
      }
    },
  };
}
