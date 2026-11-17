import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actorId, userA, userB, context } from './portal-helper';

// SQL-boundary double. Real authorization and lock orchestration run; actual
// InnoDB semantics are reserved for the separate, currently pending DB suite.
const boundary = vi.hoisted(() => ({
  calls: [] as { sql: string; values: unknown[] }[],
  migration: true,
  policy: true,
  status: 'enabled',
  role: true,
  google: true,
  session: true,
}));
vi.mock('../server/db', () => ({
  transaction: async (work: (db: unknown) => Promise<unknown>) => work({}),
  execute: async () => ({ affectedRows: 1 }),
  query: async (sql: string, values: unknown[] = []) => {
    boundary.calls.push({ sql, values });
    if (sql.includes("name='018.sql'")) return [{ name: '018.sql' }];
    if (sql.includes('FROM identity_institution'))
      return [{ initialized: 1, admin_one: actorId, admin_two: userB }];
    if (sql.includes("name='021.sql'")) return boundary.migration ? [{ name: '021.sql' }] : [];
    if (sql.includes('FROM portal_access_state'))
      return boundary.policy
        ? [
            {
              enabled: 0,
              pilot_sealed: 1,
              admissions_open: 0,
              revision: '9007199254740993',
              security_seq: '9007199254740993',
              emergency_epoch: '0',
            },
          ]
        : [];
    if (sql.includes('FROM identity_instructor_links'))
      return [
        { user_id: userB, instructor_id: 2 },
        { user_id: userA, instructor_id: 1 },
      ];
    if (sql.includes('SELECT status FROM identity_users')) return [{ status: boundary.status }];
    if (sql.includes("role='admin'")) return boundary.role ? [{ role: 'admin' }] : [];
    if (sql.includes("provider='google'")) return boundary.google ? [{ user_id: actorId }] : [];
    if (sql.includes('FROM identity_sessions')) {
      if (
        !sql.includes("application='crm'") ||
        !sql.includes('revoked_at IS NULL') ||
        !sql.includes('expires_at>') ||
        values[0] !== context.sessionHash ||
        values[1] !== actorId
      )
        throw new Error('Unsafe session query');
      return boundary.session ? [{ token_hash: context.sessionHash }] : [];
    }
    return [];
  },
}));
import { createMysqlPortalUnitOfWork } from '../server/portal-policy';

beforeEach(() => {
  Object.assign(boundary, {
    calls: [],
    migration: true,
    policy: true,
    status: 'enabled',
    role: true,
    google: true,
    session: true,
  });
});
describe('portal SQL boundary (without MySQL)', () => {
  it('fails closed before resources or effects if migration/state is absent', async () => {
    const work = vi.fn();
    boundary.migration = false;
    await expect(createMysqlPortalUnitOfWork()(work)).rejects.toMatchObject({ status: 503 });
    boundary.migration = true;
    boundary.policy = false;
    await expect(createMysqlPortalUnitOfWork()(work)).rejects.toMatchObject({ status: 503 });
    expect(work).not.toHaveBeenCalled();
  });
  it('locks institution, policy, links, ordered identities/instructors, then authority session', async () => {
    await createMysqlPortalUnitOfWork()(
      async (tx) => {
        expect((await tx.state()).revision).toBe('9007199254740993');
        await tx.authorize(context);
      },
      { userIds: [actorId] },
    );
    const calls = boundary.calls;
    const index = (s: string) => calls.findIndex((c) => c.sql.includes(s));
    expect(index('FROM identity_institution')).toBeLessThan(index('FROM portal_access_state'));
    expect(index('FROM portal_access_state')).toBeLessThan(index('FROM identity_instructor_links'));
    expect(index('FROM identity_instructor_links')).toBeLessThan(
      index('SELECT id FROM identity_users'),
    );
    expect(
      calls
        .filter((c) => c.sql.startsWith('SELECT id FROM identity_users'))
        .map((c) => c.values[0]),
    ).toEqual([actorId, userA, userB]);
    expect(
      calls.filter((c) => c.sql.startsWith('SELECT id FROM instructors')).map((c) => c.values[0]),
    ).toEqual([1, 2]);
    expect(index('SELECT id FROM instructors')).toBeLessThan(index('FROM identity_sessions'));
  });
  it.each(['status', 'role', 'google', 'session'] as const)(
    'denies invalid administrative %s',
    async (field) => {
      if (field === 'status') boundary.status = 'disabled';
      else boundary[field] = false;
      await expect(
        createMysqlPortalUnitOfWork()((tx) => tx.authorize(context), { userIds: [actorId] }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
});
