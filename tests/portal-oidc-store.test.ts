import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { opaque, digest } from '../server/oidc-crypto';
import type { PortalOidcAttempt } from '../server/portal-oidc-contracts';

const state = vi.hoisted(() => ({
  calls: [] as { sql: string; values: unknown[] }[],
  enabled: 1,
  epoch: '0',
  row: undefined as any,
  affected: 1,
  time: 1000,
}));
vi.mock('../server/db', () => ({
  transaction: async (work: (db: unknown) => Promise<unknown>) => work({}),
  query: async (sql: string, values: unknown[] = []) => {
    state.calls.push({ sql, values });
    if (sql.includes("name='018.sql'")) return [{ name: '018.sql' }];
    if (sql.includes('FROM identity_institution')) return [{ initialized: 1 }];
    if (sql.includes("name='021.sql'")) return [{ name: '021.sql' }];
    if (sql.includes('FROM portal_access_state'))
      return [
        {
          enabled: state.enabled,
          pilot_sealed: 1,
          admissions_open: 0,
          security_seq: '9007199254740993',
          emergency_epoch: state.epoch,
        },
      ];
    if (sql.includes('FROM identity_portal_oidc_attempts')) return state.row ? [state.row] : [];
    if (sql.includes(' AS now')) return [{ now: state.time }];
    throw Error('Unexpected query');
  },
  execute: async (sql: string, values: unknown[] = []) => {
    state.calls.push({ sql, values });
    return { affectedRows: state.affected };
  },
}));
import { mysqlPortalOidcStore } from '../server/portal-oidc-store';
const attempt = (): PortalOidcAttempt => ({
  id: randomUUID(),
  configurationHash: digest('config'),
  stateHash: digest(opaque()),
  browserHash: digest(opaque()),
  nonce: opaque(),
  keyId: 'test',
  encrypted: 'a'.repeat(95),
  context: { purpose: 'portal-login', expectedCrmUserId: null },
});
function prepare(status = 'pending') {
  const a = attempt();
  state.row = {
    id: a.id,
    provider: 'google',
    application: 'portal',
    configuration_hash: a.configurationHash,
    state_hash: a.stateHash,
    browser_hash: a.browserHash,
    expected_crm_user_id: null,
    exact_begin_seq: '9007199254740993',
    exact_emergency_epoch: '0',
    status,
    nonce: a.nonce,
    pkce_key_id: a.keyId,
    pkce_encrypted: a.encrypted,
    expires_at: 301000,
    subject: 'synthetic',
    token_issued_at: 1000,
    token_expires_at: 301000,
    authentication_time: null,
    issued_session_hash: null,
  };
  return a;
}
beforeEach(() =>
  Object.assign(state, {
    calls: [],
    enabled: 1,
    epoch: '0',
    row: undefined,
    affected: 1,
    time: 1000,
  }),
);

it('recovers immutable callback/finish context only with live unconsumed portal correlation', async () => {
  const a = prepare();
  await expect(mysqlPortalOidcStore().contextForCallback(a.id, a.browserHash)).resolves.toEqual({
    purpose: 'portal-login',
    expectedCrmUserId: null,
  });
  state.row.status = 'verified';
  await expect(
    mysqlPortalOidcStore().contextForCallback(a.id, a.browserHash),
  ).resolves.toMatchObject({ purpose: 'portal-login' });
  state.row.status = 'consumed';
  await expect(mysqlPortalOidcStore().contextForCallback(a.id, a.browserHash)).rejects.toThrow();
});
it('rejects expired callback context and mismatched browser before Google', async () => {
  const a = prepare();
  state.time = 400000;
  await expect(mysqlPortalOidcStore().contextForCallback(a.id, a.browserHash)).rejects.toThrow();
  state.time = 1000;
  await expect(mysqlPortalOidcStore().contextForCallback(a.id, digest('other'))).rejects.toThrow();
});
it('creates portal-only rows with DB clock, five minutes and exact counter snapshot', async () => {
  const a = attempt();
  expect(await mysqlPortalOidcStore().create(a)).toBe(301000);
  const insert = state.calls.find((c) => c.sql.startsWith('INSERT'))!;
  expect(insert.sql).toContain("'google','portal'");
  expect(insert.values).toContain('9007199254740993');
  expect(insert.values.slice(-2)).toEqual([1000, 301000]);
  expect(state.calls.findIndex((c) => c.sql.includes('FROM identity_institution'))).toBeLessThan(
    state.calls.findIndex((c) => c.sql.includes('FROM portal_access_state')),
  );
  expect(state.calls.some((c) => /INSERT INTO identity_sessions/.test(c.sql))).toBe(false);
});
it('does not create while policy is disabled', async () => {
  state.enabled = 0;
  await expect(mysqlPortalOidcStore().create(attempt())).rejects.toThrow(
    /^OIDC operation unavailable\.$/,
  );
  expect(state.calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
});
it('claims atomically and erases PKCE/nonce, rejecting zero affected rows', async () => {
  const a = prepare();
  expect(await mysqlPortalOidcStore().claim(a.stateHash, a)).toMatchObject({
    id: a.id,
    nonce: a.nonce,
  });
  const update = state.calls.find((c) => c.sql.includes("SET status='claimed'"))!;
  expect(update.sql).toContain('nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL');
  expect(update.sql).toContain("status='pending'");
  state.affected = 0;
  await expect(mysqlPortalOidcStore().claim(a.stateHash, a)).rejects.toThrow();
});
it.each([
  'application',
  'configuration_hash',
  'browser_hash',
  'expected_crm_user_id',
  'exact_emergency_epoch',
  'expired',
])('rejects invalid persisted %s', async (field) => {
  const a = prepare();
  if (field === 'expired') state.time = 301000;
  else state.row[field] = field === 'application' ? 'crm' : 'wrong';
  await expect(mysqlPortalOidcStore().claim(a.stateHash, a)).rejects.toThrow();
  expect(state.calls.some((c) => c.sql.startsWith('UPDATE'))).toBe(false);
});
it('keeps verification separate from consumption and exposes barriers for future finish', async () => {
  const a = prepare('claimed'),
    store = mysqlPortalOidcStore();
  await store.verify(a, {
    subject: 'synthetic',
    issuedAt: 1000,
    expiresAt: 300000,
    authenticationTime: null,
  });
  expect(state.calls.some((c) => /consumed|INSERT INTO identity_sessions/.test(c.sql))).toBe(false);
  state.row.status = 'verified';
  expect(await store.readEvidenceForFinish({} as PoolConnection, a)).toMatchObject({
    subject: 'synthetic',
    beginSeq: '9007199254740993',
    emergencyEpoch: '0',
    expectedCrmUserId: null,
  });
});
it('cancels expired attempts even when disabled and retains consumed association', async () => {
  const a = prepare(),
    store = mysqlPortalOidcStore();
  state.enabled = 0;
  state.time = 400000;
  await expect(store.cancel(a.id, a.browserHash)).resolves.toEqual({ issuedSessionHash: null });
  expect(state.calls.find((c) => c.sql.includes("SET status='invalidated'"))?.sql).toContain(
    'subject=NULL',
  );
  state.calls = [];
  state.row.status = 'consumed';
  state.row.issued_session_hash = 'a'.repeat(64);
  await expect(store.cancel(a.id, a.browserHash)).resolves.toEqual({
    issuedSessionHash: 'a'.repeat(64),
  });
  expect(state.calls.some((c) => c.sql.startsWith('UPDATE') || c.sql.startsWith('DELETE'))).toBe(
    false,
  );
});
