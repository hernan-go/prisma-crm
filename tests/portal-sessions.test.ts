import { beforeEach, expect, it, vi } from 'vitest';
import { sessionDigest } from '../server/identity';
const m = vi.hoisted(() => ({
  enabled: true,
  role: true,
  active: true,
  link: true,
  barrier: '2',
  epoch: '0',
  crm: 'a' as string | null,
  expected: null as string | null,
  revoked: false,
  associated: true,
  consumed: false,
  failAudit: false,
  rows: [] as unknown[][],
  calls: [] as string[],
}));
vi.mock('../server/portal-policy', () => ({
  withPortalDatabase: async (work: (db: unknown, tx: unknown) => Promise<unknown>) => {
    const saved = { rows: [...m.rows], consumed: m.consumed };
    try {
      return await work(
        {},
        {
          state: async () => ({
            enabled: m.enabled,
            pilot_sealed: true,
            admissions_open: false,
            security_seq: '2',
            emergency_epoch: m.epoch,
          }),
          links: async () =>
            m.link
              ? [
                  { user_id: 'a', instructor_id: 1, status: 'enabled', min_login_seq: m.barrier },
                  { user_id: 'b', instructor_id: 2, status: 'enabled', min_login_seq: '1' },
                ]
              : [],
          assertEligible: async () => {
            if (!m.role || !m.active) throw Error('ineligible');
          },
        },
      );
    } catch (e) {
      m.rows = saved.rows;
      m.consumed = saved.consumed;
      throw e;
    }
  },
}));
vi.mock('../server/portal-oidc-store', () => ({
  mysqlPortalOidcStore: () => ({
    readEvidenceForFinish: async () => {
      if (m.consumed) throw Error('consumed');
      return { subject: 'sub', beginSeq: '2', emergencyEpoch: '0', expectedCrmUserId: m.expected };
    },
  }),
}));
vi.mock('../server/db', () => ({
  query: async (sql: string) => {
    m.calls.push(sql);
    if (sql.includes(' AS now')) return [{ now: 1000 }];
    if (sql.includes('JOIN identity_users')) return m.crm ? [{ user_id: m.crm }] : [];
    if (sql.includes('identity_external_accounts')) return [{ user_id: 'a' }];
    if (sql.includes('identity_portal_oidc_attempts'))
      return m.associated
        ? [{ begin_seq: '2', emergency_epoch: '0', expected_crm_user_id: null }]
        : [];
    if (sql.includes('identity_sessions'))
      return m.revoked ? [] : [{ user_id: 'a', expires_at: 28801000 }];
    throw Error('unknown SQL');
  },
  execute: async (sql: string, values: unknown[]) => {
    m.calls.push(sql);
    if (sql.startsWith('INSERT INTO identity_sessions')) m.rows.push(values);
    if (sql.startsWith('UPDATE identity_portal_oidc_attempts')) {
      if (m.consumed) return { affectedRows: 0 };
      m.consumed = true;
    }
    if (sql.includes('identity_audit_events') && m.failAudit) throw Error('audit failed');
    return { affectedRows: 1 };
  },
}));
import { createPortalSessionService } from '../server/portal-sessions';
const empty = { crmTokens: [], portalTokens: [], legacyPresent: false };
const ref = {
  id: 'id',
  browserHash: 'hash',
  configurationHash: 'hash',
  context: { purpose: 'portal-login' as const, expectedCrmUserId: null },
};
const token = 'a'.repeat(64);
beforeEach(() =>
  Object.assign(m, {
    enabled: true,
    role: true,
    active: true,
    link: true,
    barrier: '2',
    epoch: '0',
    crm: 'a',
    expected: null,
    revoked: false,
    associated: true,
    consumed: false,
    failAudit: false,
    rows: [],
    calls: [],
  }),
);
it('issues random opaque token with hash only, fixed eight hours and atomic association', async () => {
  const result = await createPortalSessionService().finish(ref, empty);
  expect(result.token).toMatch(/^[a-f0-9]{64}$/);
  expect(result.expiresAt).toBe(28801000);
  expect(m.rows[0]).toEqual([sessionDigest(result.token), 'a', 1000, 28801000]);
  expect(m.consumed).toBe(true);
  await expect(createPortalSessionService().finish(ref, empty)).rejects.toThrow();
});
it.each(['role', 'active', 'link', 'enabled', 'barrier', 'epoch', 'expected'] as const)(
  'rejects invalid %s before issuing',
  async (field) => {
    if (field === 'barrier') m.barrier = '3';
    else if (field === 'epoch') m.epoch = '1';
    else if (field === 'expected') m.expected = 'b';
    else m[field] = false;
    await expect(createPortalSessionService().finish(ref, empty)).rejects.toThrow();
    expect(m.rows).toHaveLength(0);
  },
);
it('rolls back session and consumption on audit error', async () => {
  m.failAudit = true;
  await expect(createPortalSessionService().finish(ref, empty)).rejects.toThrow();
  expect(m.rows).toHaveLength(0);
  expect(m.consumed).toBe(false);
});
it.each(['legacy', 'duplicate-crm', 'portal-cookie'])('rejects %s ambiguity', async (kind) => {
  const c = {
    ...empty,
    legacyPresent: kind === 'legacy',
    crmTokens: kind === 'duplicate-crm' ? [token, token] : [],
    portalTokens: kind === 'portal-cookie' ? [token] : [],
  };
  await expect(createPortalSessionService().finish(ref, c)).rejects.toMatchObject({ status: 409 });
});
it('accepts independent same identity CRM and rejects different/current invalid identity', async () => {
  const c = { ...empty, crmTokens: [token] };
  await expect(createPortalSessionService().finish(ref, c)).resolves.toMatchObject({ userId: 'a' });
  m.consumed = false;
  m.crm = 'b';
  await expect(createPortalSessionService().finish(ref, c)).rejects.toMatchObject({ status: 409 });
  m.crm = null;
  await expect(createPortalSessionService().expectedCrm(c)).rejects.toMatchObject({ status: 409 });
});
it.each(['revoked', 'associated', 'conflict', 'duplicate'])('guard rejects %s', async (field) => {
  if (field === 'revoked') m.revoked = true;
  if (field === 'associated') m.associated = false;
  if (field === 'conflict') m.crm = 'b';
  const c = {
    ...empty,
    portalTokens: field === 'duplicate' ? [token, token] : [token],
    crmTokens: field === 'conflict' ? [token] : [],
  };
  await expect(createPortalSessionService().authenticate(token, c)).rejects.toThrow();
});
it('guard returns fixed expiry without refreshing or emitting any session', async () => {
  await expect(
    createPortalSessionService().authenticate(token, { ...empty, portalTokens: [token] }),
  ).resolves.toMatchObject({ userId: 'a', expiresAt: 28801000 });
  expect(m.calls.some((s) => s.startsWith('UPDATE') || s.startsWith('INSERT'))).toBe(false);
});
