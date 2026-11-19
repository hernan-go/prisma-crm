import { beforeEach, expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
const model = vi.hoisted(() => ({
  migration: true,
  status: 'enabled',
  roles: ['admin', 'facilitator'],
  subject: 'private-sub',
  active: 1,
  fail: false,
  calls: [] as { sql: string; values: unknown[] }[],
}));
vi.mock('../server/db', () => ({
  query: async (sql: string, values: unknown[] = []) => {
    model.calls.push({ sql, values });
    if (sql.includes('schema_migrations')) return model.migration ? [{ name: '021.sql' }] : [];
    if (sql.includes('portal_access_state'))
      return [{ revision: '9007199254740993', security_seq: '9007199254740993' }];
    if (sql.includes('identity_instructor_links'))
      return [{ user_id: 'a', instructor_id: 1, revision: '1', min_login_seq: '1' }];
    if (sql.includes('identity_users')) return [{ status: model.status }];
    if (sql.includes('identity_user_roles')) return model.roles.map((role) => ({ role }));
    if (sql.includes('identity_external_accounts')) return [{ subject: model.subject }];
    if (sql.includes('instructors')) return [{ active: model.active }];
    throw Error('unexpected SQL');
  },
  execute: async (sql: string, values: unknown[] = []) => {
    model.calls.push({ sql, values });
    if (model.fail && sql.includes('INSERT INTO identity_audit_events'))
      throw Error('audit failure');
    return { affectedRows: 1 };
  },
}));
import { preparePortalMutation } from '../server/portal-hooks';
const db = {} as PoolConnection;
beforeEach(() =>
  Object.assign(model, {
    migration: true,
    status: 'enabled',
    roles: ['admin', 'facilitator'],
    subject: 'private-sub',
    active: 1,
    fail: false,
    calls: [],
  }),
);
it.each(['status', 'roles', 'subject', 'active'])(
  'invalidates effective %s changes on the same connection',
  async (field) => {
    const hook = await preparePortalMutation(db);
    if (field === 'status') model.status = 'disabled';
    if (field === 'roles') model.roles = ['admin'];
    if (field === 'subject') model.subject = 'replacement-private';
    if (field === 'active') model.active = 0;
    await hook.finish();
    const writes = model.calls.filter((c) => c.sql.startsWith('UPDATE'));
    expect(writes.find((c) => c.sql.includes('portal_access_state'))?.values).toEqual([
      '9007199254740994',
      '9007199254740994',
    ]);
    expect(writes.find((c) => c.sql.includes('identity_instructor_links'))?.values).toEqual([
      '2',
      '9007199254740994',
      'a',
    ]);
    expect(writes.find((c) => c.sql.includes('identity_sessions'))?.values).toEqual(['a']);
    expect(writes.find((c) => c.sql.includes('identity_sessions'))?.sql).toContain(
      "application='portal'",
    );
    const audit = model.calls.find((c) => c.sql.startsWith('INSERT'))!;
    expect(JSON.stringify(audit.values)).not.toContain(model.subject);
    expect(model.roles).toContain('admin');
  },
);
it('does not invalidate a no-op or fields outside eligibility', async () => {
  await (await preparePortalMutation(db)).finish();
  expect(model.calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
});
it('explicit revocation advances only its member even without live sessions', async () => {
  await (await preparePortalMutation(db)).finish(['a']);
  expect(model.calls.some((c) => c.sql.includes('UPDATE identity_instructor_links'))).toBe(true);
});
it('other identities are unaffected', async () => {
  await (await preparePortalMutation(db)).finish(['b']);
  expect(model.calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
});
it('legacy installations skip portal tables when 021 is absent', async () => {
  model.migration = false;
  await (await preparePortalMutation(db)).finish(['a']);
  expect(model.calls).toHaveLength(1);
});
it('audit failure propagates to the original transaction', async () => {
  const hook = await preparePortalMutation(db);
  model.active = 0;
  model.fail = true;
  await expect(hook.finish()).rejects.toThrow('audit failure');
});
it('locks policy then links and identity resources before instructors', async () => {
  await preparePortalMutation(db);
  const pos = (s: string) => model.calls.findIndex((c) => c.sql.includes(s));
  expect(pos('portal_access_state')).toBeLessThan(pos('identity_instructor_links'));
  expect(pos('identity_external_accounts')).toBeLessThan(pos('FROM instructors'));
});
