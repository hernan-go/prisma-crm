// Opt-in persistence adapter. No composition root imports it; absent portal schema
// cannot affect administrative auth. Construction opens no database connection.
import type { PoolConnection } from 'mysql2/promise';
import { execute, query, transaction } from './db.js';
import { lockInstitution } from './identity-policy.js';
import { AppError } from './errors.js';
import {
  portalCounter,
  type PortalLink,
  type PortalReceipt,
  type PortalState,
  type PortalTransaction,
  type PortalUnitOfWork,
  type PortalLockScope,
} from '../shared/portal.js';

const linkColumns =
  'user_id,instructor_id,pilot_slot,status,CAST(revision AS CHAR) revision,CAST(min_login_seq AS CHAR) min_login_seq';

// Caller MUST hold institution then portal policy, in its own active transaction.
// For future emission/hooks: use this adapter on that same connection; do not call
// the standalone unit of work from another transaction.
export function portalTransaction(
  db: PoolConnection,
  institution: { initialized: number; admin_one: string | null; admin_two: string | null },
  state: PortalState,
): PortalTransaction {
  return {
    state: async () => ({ ...state }),
    authorize: async (context) => {
      if (
        !institution.initialized ||
        ![institution.admin_one, institution.admin_two].includes(context.userId)
      )
        throw new AppError(403, 'Requiere administrador institucional individual.');
      const [user] = await query<{ status: string }>(
        'SELECT status FROM identity_users WHERE id=? FOR UPDATE',
        [context.userId],
        db,
      );
      const roles = await query(
        "SELECT role FROM identity_user_roles WHERE user_id=? AND role='admin' FOR UPDATE",
        [context.userId],
        db,
      );
      const external = await query(
        "SELECT user_id FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
        [context.userId],
        db,
      );
      const sessions = await query(
        `SELECT token_hash FROM identity_sessions WHERE token_hash=? AND user_id=? AND application='crm' AND revoked_at IS NULL AND expires_at>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) FOR UPDATE`,
        [context.sessionHash, context.userId],
        db,
      );
      if (user?.status !== 'enabled' || !roles.length || !external.length || !sessions.length)
        throw new AppError(403, 'Sesión administrativa individual no vigente.');
      return context;
    },
    links: () =>
      query<PortalLink>(
        `SELECT ${linkColumns} FROM identity_instructor_links ORDER BY user_id FOR UPDATE`,
        [],
        db,
      ),
    assertEligible: async (members) => {
      // Singleton portal serialization + institutional lock precede these rows.
      for (const m of [...members].sort((a, b) =>
        a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
      )) {
        const [u] = await query<{ status: string }>(
          'SELECT status FROM identity_users WHERE id=? FOR UPDATE',
          [m.userId],
          db,
        );
        const roles = await query(
          "SELECT role FROM identity_user_roles WHERE user_id=? AND role='facilitator' FOR UPDATE",
          [m.userId],
          db,
        );
        const google = await query(
          "SELECT user_id FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
          [m.userId],
          db,
        );
        if (u?.status !== 'enabled' || !roles.length || !google.length)
          throw new AppError(409, 'Identidad no elegible para el piloto.');
      }
      for (const m of [...members].sort((a, b) => a.instructorId - b.instructorId)) {
        const [instructor] = await query<{ active: number }>(
          'SELECT active FROM instructors WHERE id=? FOR UPDATE',
          [m.instructorId],
          db,
        );
        if (!instructor?.active) throw new AppError(409, 'Instructor inexistente o inactivo.');
      }
    },
    saveState: async (s) => {
      [s.revision, s.security_seq, s.emergency_epoch].forEach((v) => portalCounter.parse(v));
      await execute(
        'UPDATE portal_access_state SET enabled=?,pilot_sealed=?,revision=?,security_seq=?,emergency_epoch=? WHERE id=1',
        [s.enabled, s.pilot_sealed, s.revision, s.security_seq, s.emergency_epoch],
        db,
      );
    },
    insertLink: async (l) => {
      await execute(
        'INSERT INTO identity_instructor_links(user_id,instructor_id,pilot_slot,status,revision,min_login_seq) VALUES (?,?,?,?,?,?)',
        [l.user_id, l.instructor_id, l.pilot_slot, l.status, l.revision, l.min_login_seq],
        db,
      );
    },
    saveLink: async (l) => {
      await execute(
        'UPDATE identity_instructor_links SET status=?,revision=?,min_login_seq=? WHERE user_id=?',
        [l.status, l.revision, l.min_login_seq, l.user_id],
        db,
      );
    },
    revokePortalSessions: async (userId) => {
      await execute(
        "UPDATE identity_sessions SET revoked_at=GREATEST(created_at,CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)) WHERE application='portal' AND revoked_at IS NULL" +
          (userId ? ' AND user_id=?' : ''),
        userId ? [userId] : [],
        db,
      );
    },
    receipt: async (operationId) => {
      const [r] = await query<{
        operation_id: string;
        actor_id: string;
        user_id: string;
        event: string;
        details_json: PortalReceipt['details'] | string;
      }>(
        'SELECT operation_id,actor_id,user_id,event,details_json FROM identity_audit_events WHERE operation_id=? FOR UPDATE',
        [operationId],
        db,
      );
      if (!r) return undefined;
      const details =
        typeof r.details_json === 'string' ? JSON.parse(r.details_json) : r.details_json;
      if (!details || details.version !== 1 || !details.request || !details.result)
        throw new AppError(503, 'Recibo portal incompatible.');
      return {
        operationId: r.operation_id,
        actorId: r.actor_id,
        userId: r.user_id,
        event: r.event,
        details,
      };
    },
    audit: async (r) => {
      const json = JSON.stringify(r.details);
      if (Buffer.byteLength(json) > 12000)
        throw new AppError(409, 'Recibo portal excede el límite.');
      await execute(
        'INSERT INTO identity_audit_events(user_id,actor_id,event,details_json,operation_id) VALUES (?,?,?,?,?)',
        [r.userId, r.actorId, r.event, json, r.operationId],
        db,
      );
    },
  };
}

export function createMysqlPortalUnitOfWork(): PortalUnitOfWork {
  return (work, scope) => withPortalDatabase((_db, tx) => work(tx), scope);
}

// Shared lock coordinator: issuance/guards use the SAME connection as policy.
export function withPortalDatabase<T>(
  work: (db: PoolConnection, tx: PortalTransaction) => Promise<T>,
  scope?: PortalLockScope,
) {
  return transaction(async (db) => {
    const institution = await lockInstitution(db);
    if (!institution?.initialized)
      throw new AppError(503, 'Se requiere estado institucional inicializado.');
    const migration = await query(
      "SELECT name FROM schema_migrations WHERE name='021.sql'",
      [],
      db,
    );
    if (!migration.length) throw new AppError(503, 'Se requiere migración portal 021.');
    const [row] = await query<{
      enabled: number;
      pilot_sealed: number;
      admissions_open: number;
      revision: string;
      security_seq: string;
      emergency_epoch: string;
    }>(
      'SELECT enabled,pilot_sealed,admissions_open,CAST(revision AS CHAR) revision,CAST(security_seq AS CHAR) security_seq,CAST(emergency_epoch AS CHAR) emergency_epoch FROM portal_access_state WHERE id=1 FOR UPDATE',
      [],
      db,
    );
    if (!row || row.admissions_open || (row.enabled && !row.pilot_sealed))
      throw new AppError(503, 'Estado portal incompleto.');
    const state: PortalState = {
      ...row,
      enabled: Boolean(row.enabled),
      pilot_sealed: Boolean(row.pilot_sealed),
      admissions_open: false,
    };
    // Within the identity/instructor/link group: all links by UUID, then users
    // and their roles/bindings by UUID, then instructors by numeric ID. Sessions
    // are acquired only by work(), after every resource row has been locked.
    const links = await query<PortalLink>(
      `SELECT ${linkColumns} FROM identity_instructor_links ORDER BY user_id FOR UPDATE`,
      [],
      db,
    );
    const userIds = [
      ...new Set([
        ...(scope?.userIds ?? []),
        ...(scope?.members ?? []).map((m) => m.userId),
        ...links.map((l) => l.user_id),
      ]),
    ].sort();
    for (const id of userIds) {
      await query('SELECT id FROM identity_users WHERE id=? FOR UPDATE', [id], db);
      await query(
        'SELECT role FROM identity_user_roles WHERE user_id=? ORDER BY role FOR UPDATE',
        [id],
        db,
      );
      await query(
        'SELECT provider FROM identity_external_accounts WHERE user_id=? ORDER BY provider FOR UPDATE',
        [id],
        db,
      );
    }
    const instructorIds = [
      ...new Set([
        ...(scope?.members ?? []).map((m) => m.instructorId),
        ...links.map((l) => l.instructor_id),
      ]),
    ].sort((a, b) => a - b);
    for (const id of instructorIds)
      await query('SELECT id FROM instructors WHERE id=? FOR UPDATE', [id], db);
    return work(db, portalTransaction(db, institution, state));
  });
}
