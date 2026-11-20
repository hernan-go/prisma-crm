import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPortalAccessService, validatePortalLoginContext } from '../server/portal-access';
import { actorId, context, members, memoryPortal, userA, userB, userC } from './portal-helper';

function fixture() {
  const store = memoryPortal();
  let clock = 1000;
  const service = createPortalAccessService(store.run, Buffer.alloc(32, 7), () => clock);
  return {
    ...store,
    service,
    tick: () => {
      clock += 300001;
    },
  };
}
async function sealed() {
  const f = fixture();
  const prepared = await f.service.preparePilot(context, members);
  await f.service.sealPilot(context, randomUUID(), prepared);
  return f;
}
async function opened() {
  const f = await sealed();
  await f.service.setPortalEnabled(context, {
    operationId: randomUUID(),
    expectedRevision: '1',
    enabled: true,
  });
  return f;
}
const change = (revision: string, linkRevision: string, enabled: boolean, userId = userB) => ({
  operationId: randomUUID(),
  expectedRevision: revision,
  expectedLinkRevision: linkRevision,
  userId,
  enabled,
});

describe('PWA-1B.1 internal access policy', () => {
  it('recovers a committed seal after process loss only for its authorized session and original pairs/revision', async () => {
    const f = fixture(),
      plan = await f.service.preparePilot(context, members),
      id = randomUUID();
    const result = await f.service.sealPilot(context, id, plan);
    f.tick();
    const restarted = createPortalAccessService(f.run, Buffer.alloc(32, 7));
    expect(await restarted.recoverSeal(context, id, '0', members)).toEqual(result);
    await expect(restarted.recoverSeal(context, id, '1', members)).rejects.toThrow();
    await expect(
      restarted.recoverSeal(context, id, '0', [members[0], { userId: userC, instructorId: 3 }]),
    ).rejects.toThrow();
    await expect(
      restarted.recoverSeal({ ...context, sessionHash: '0'.repeat(64) }, id, '0', members),
    ).rejects.toThrow();
    expect(f.snapshot().receipts).toHaveLength(1);
  });
  it('seals exactly two explicit links, remains disabled and never opens admissions', async () => {
    const f = await sealed();
    const s = f.snapshot();
    expect(s.links.map((l) => [l.user_id, l.instructor_id, l.pilot_slot])).toEqual([
      [userA, 1, 1],
      [userB, 2, 2],
    ]);
    expect(s.state).toEqual({
      enabled: false,
      pilot_sealed: true,
      admissions_open: false,
      revision: '1',
      security_seq: '1',
      emergency_epoch: '0',
    });
    expect(s.links.map((l) => l.min_login_seq)).toEqual(['1', '1']);
    expect(s.receipts).toHaveLength(1);
  });
  it.each(
    [
      [],
      [members[0]],
      [...members, { userId: userC, instructorId: 3 }],
      [members[0], members[0]],
      [members[0], { userId: userB, instructorId: 1 }],
    ].map((items) => ({ items })),
  )('rejects invalid pilot membership $items', async ({ items }) => {
    const f = fixture();
    await expect(f.service.preparePilot(context, items)).rejects.toThrow();
    expect(f.snapshot().links).toHaveLength(0);
  });
  it('requires eligibility again at confirmation', async () => {
    const f = fixture(),
      p = await f.service.preparePilot(context, members);
    f.eligible.delete(userB + ':2');
    await expect(f.service.sealPilot(context, randomUUID(), p)).rejects.toThrow();
    expect(f.snapshot().receipts).toHaveLength(0);
  });
  it('normalizes member order and rejects a preparation with a stale revision', async () => {
    const f = fixture(),
      first = await f.service.preparePilot(context, members);
    expect(await f.service.preparePilot(context, [...members].reverse())).toEqual(first);
    f.setState({ revision: '1' });
    await expect(f.service.sealPilot(context, randomUUID(), first)).rejects.toThrow('obsoleta');
    expect(f.snapshot().links).toHaveLength(0);
  });
  it('rechecks role/binding/instructor eligibility for an admitted identity', async () => {
    const f = await opened();
    f.eligible.delete(userA + ':1');
    await expect(
      f.service.validateLogin(userA, { begin_seq: '2', emergency_epoch: '0' }),
    ).rejects.toThrow();
    await expect(
      f.service.validateLogin(userC, { begin_seq: '2', emergency_epoch: '0' }),
    ).rejects.toThrow();
  });
  it('rejects a pre-admission attempt after the pilot is sealed and opened', async () => {
    const f = await opened();
    await expect(
      f.service.validateLogin(userA, { begin_seq: '0', emergency_epoch: '0' }),
    ).rejects.toThrow();
  });
  it('rejects altered, expired and differently scoped plans', async () => {
    const f = fixture(),
      p = await f.service.preparePilot(context, members);
    const altered = structuredClone(p);
    altered.plan.members[0].instructorId = 3;
    await expect(f.service.sealPilot(context, randomUUID(), altered)).rejects.toThrow();
    await expect(
      f.service.sealPilot({ ...context, userId: userA }, randomUUID(), p),
    ).rejects.toThrow();
    await expect(
      f.service.sealPilot({ ...context, sessionHash: 'b'.repeat(64) }, randomUUID(), p),
    ).rejects.toThrow();
    f.tick();
    await expect(f.service.sealPilot(context, randomUUID(), p)).rejects.toThrow();
    expect(f.snapshot().links).toHaveLength(0);
  });
  it('replays a committed seal after proof expiry without duplicating audit or revisions', async () => {
    const f = fixture(),
      p = await f.service.preparePilot(context, members),
      id = randomUUID();
    const result = await f.service.sealPilot(context, id, p);
    f.tick();
    expect(await f.service.sealPilot(context, id, p)).toEqual(result);
    expect(f.snapshot().receipts).toHaveLength(1);
    expect(f.snapshot().state.security_seq).toBe('1');
  });
  it('requires current actor authority even for an identical retry', async () => {
    const f = fixture(),
      p = await f.service.preparePilot(context, members),
      id = randomUUID();
    await f.service.sealPilot(context, id, p);
    f.controls.authorized = false;
    await expect(f.service.sealPilot(context, id, p)).rejects.toThrow();
  });
  it('conflicts when a different authorized actor or session reuses an operation ID', async () => {
    const f = await sealed(),
      input = change('1', '1', false);
    await f.service.setLinkEnabled(context, input);
    f.actors.set('b'.repeat(64), userA);
    f.actors.set('c'.repeat(64), actorId);
    await expect(
      f.service.setLinkEnabled({ userId: userA, sessionHash: 'b'.repeat(64) }, input),
    ).rejects.toThrow('otro contenido');
    await expect(
      f.service.setLinkEnabled({ userId: actorId, sessionHash: 'c'.repeat(64) }, input),
    ).rejects.toThrow('otro contenido');
    expect(f.snapshot().receipts).toHaveLength(2);
  });
  it('never replaces a disabled member with a third identity or instructor', async () => {
    const f = await sealed();
    await f.service.setLinkEnabled(context, change('1', '1', false));
    await expect(
      f.service.preparePilot(context, [members[0], { userId: userC, instructorId: 3 }]),
    ).rejects.toThrow();
    await expect(
      f.service.setLinkEnabled(context, change('2', '1', true, userC)),
    ).rejects.toThrow();
    expect(f.snapshot().links.map((l) => l.user_id)).toEqual([userA, userB]);
  });
  it('conflicts on reused operation ID with different parameters, type or revision', async () => {
    const f = await sealed(),
      input = change('1', '1', false);
    await f.service.setLinkEnabled(context, input);
    await expect(f.service.setLinkEnabled(context, { ...input, enabled: true })).rejects.toThrow();
    await expect(
      f.service.setLinkEnabled(context, { ...input, expectedRevision: '2' }),
    ).rejects.toThrow();
    const { enabled: _enabled, ...revocation } = input;
    await expect(f.service.revokePortalSessions(context, revocation)).rejects.toThrow();
    expect(f.snapshot().receipts).toHaveLength(2);
  });
  it('does not advance barriers on an effective no-op', async () => {
    const f = await sealed();
    await f.service.setLinkEnabled(context, change('1', '1', true));
    expect(f.snapshot().state.security_seq).toBe('1');
    expect(f.snapshot().sessions.every((s) => !s.revoked)).toBe(true);
  });
  it('rejects stale global and link revisions without effects', async () => {
    const f = await sealed();
    await expect(f.service.setLinkEnabled(context, change('0', '1', false))).rejects.toThrow();
    await expect(f.service.setLinkEnabled(context, change('1', '0', false))).rejects.toThrow();
    expect(f.snapshot().receipts).toHaveLength(1);
  });
  it('revokes B and readmits immediately while preserving A login and CRM sessions', async () => {
    const f = await opened(),
      start = f.snapshot().state;
    await f.service.setLinkEnabled(context, change('2', '1', false));
    await f.service.setLinkEnabled(context, change('3', '2', true));
    const s = f.snapshot(),
      a = s.links[0],
      b = s.links[1];
    expect(() =>
      validatePortalLoginContext(s.state, a, {
        begin_seq: start.security_seq,
        emergency_epoch: start.emergency_epoch,
      }),
    ).not.toThrow();
    expect(() =>
      validatePortalLoginContext(s.state, b, {
        begin_seq: start.security_seq,
        emergency_epoch: start.emergency_epoch,
      }),
    ).toThrow();
    expect(() =>
      validatePortalLoginContext(s.state, b, {
        begin_seq: s.state.security_seq,
        emergency_epoch: s.state.emergency_epoch,
      }),
    ).not.toThrow();
    expect(s.sessions.map((x) => x.revoked)).toEqual([false, true, false]);
    expect(b.min_login_seq).toBe('4');
  });
  it('portal session revocation advances only the target and serializes identical retries', async () => {
    const f = await opened(),
      { enabled: _enabled, ...input } = change('2', '1', true);
    const [r, repeated] = await Promise.all([
      f.service.revokePortalSessions(context, input),
      f.service.revokePortalSessions(context, input),
    ]);
    expect(repeated).toEqual(r);
    expect(await f.service.revokePortalSessions(context, input)).toEqual(r);
    expect(f.snapshot().links.map((l) => l.min_login_seq)).toEqual(['1', '3']);
    expect(f.snapshot().sessions.map((s) => s.revoked)).toEqual([false, true, false]);
    expect(f.snapshot().receipts).toHaveLength(3);
    expect(f.snapshot().receipts[2].event).toBe('portal.sessions.revoked');
  });
  it.each(['sessions-only', 'withdraw-access'] as const)(
    'defines new-login eligibility after %s without affecting another identity',
    async (mode) => {
      const f = await opened();
      const oldAttempt = { begin_seq: '2', emergency_epoch: '0' };
      const input = change('2', '1', false);
      if (mode === 'sessions-only') {
        const { enabled: _enabled, ...revocation } = input;
        await f.service.revokePortalSessions(context, revocation);
      } else {
        await f.service.setLinkEnabled(context, input);
      }
      const after = f.snapshot();
      expect(after.links[1].status).toBe(mode === 'sessions-only' ? 'enabled' : 'disabled');
      expect(after.links[1].min_login_seq).toBe('3');
      expect(after.sessions.map((s) => s.revoked)).toEqual([false, true, false]);
      await expect(f.service.validateLogin(userB, oldAttempt)).rejects.toThrow();
      await expect(f.service.validateLogin(userA, oldAttempt)).resolves.toEqual({
        userId: userA,
        instructorId: 1,
      });
      const newAttempt = { begin_seq: '3', emergency_epoch: '0' };
      if (mode === 'sessions-only') {
        await expect(f.service.validateLogin(userB, newAttempt)).resolves.toEqual({
          userId: userB,
          instructorId: 2,
        });
      } else {
        await expect(f.service.validateLogin(userB, newAttempt)).rejects.toThrow();
        await f.service.setLinkEnabled(context, change('3', '2', true));
        // Rehabilitation advances the barrier again, including attempts that
        // started while disabled. It never unrevokes previously issued sessions.
        await expect(f.service.validateLogin(userB, oldAttempt)).rejects.toThrow();
        await expect(f.service.validateLogin(userB, newAttempt)).rejects.toThrow();
        await expect(
          f.service.validateLogin(userB, { begin_seq: '4', emergency_epoch: '0' }),
        ).resolves.toEqual({ userId: userB, instructorId: 2 });
        expect(f.snapshot().sessions.map((s) => s.revoked)).toEqual([false, true, false]);
        await expect(f.service.validateLogin(userA, oldAttempt)).resolves.toBeDefined();
      }
    },
  );
  it('emergency close invalidates all old attempts after reopening and only portal sessions', async () => {
    const f = await opened(),
      old = f.snapshot().state;
    const input = { operationId: randomUUID(), expectedRevision: '2', enabled: false };
    await f.service.setPortalEnabled(context, input);
    await f.service.setPortalEnabled(context, input);
    await f.service.setPortalEnabled(context, {
      operationId: randomUUID(),
      expectedRevision: '3',
      enabled: true,
    });
    const s = f.snapshot();
    expect(s.state.emergency_epoch).toBe('1');
    for (const l of s.links)
      expect(() =>
        validatePortalLoginContext(s.state, l, {
          begin_seq: old.security_seq,
          emergency_epoch: old.emergency_epoch,
        }),
      ).toThrow();
    expect(s.sessions.map((x) => x.revoked)).toEqual([true, true, false]);
  });
  it('audit failure rolls back revisions, links and revocation; same ID may retry', async () => {
    const f = await opened(),
      before = f.snapshot(),
      input = change('2', '1', false);
    f.controls.failAudit = true;
    await expect(f.service.setLinkEnabled(context, input)).rejects.toThrow('Audit failure');
    expect(f.snapshot()).toEqual(before);
    f.controls.failAudit = false;
    await f.service.setLinkEnabled(context, input);
    expect(f.snapshot().state.revision).toBe('3');
  });
  it('serializes concurrent identical operations to one receipt', async () => {
    const f = await opened(),
      input = change('2', '1', false);
    const [one, two] = await Promise.all([
      f.service.setLinkEnabled(context, input),
      f.service.setLinkEnabled(context, input),
    ]);
    expect(one).toEqual(two);
    expect(f.snapshot().state.revision).toBe('3');
    expect(f.snapshot().receipts).toHaveLength(3);
  });
  it('allows only one of two conflicting optimistic writes', async () => {
    const f = await opened();
    const results = await Promise.allSettled([
      f.service.setLinkEnabled(context, change('2', '1', false)),
      f.service.setLinkEnabled(context, change('2', '1', false, userA)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.snapshot().state.revision).toBe('3');
  });
  it('keeps counters exact beyond Number precision and fails on overflow', async () => {
    const f = await sealed();
    f.setState({ revision: '9007199254740993', security_seq: '9007199254740993' });
    await f.service.setLinkEnabled(context, change('9007199254740993', '1', false));
    expect(f.snapshot().links[1].min_login_seq).toBe('9007199254740994');
    f.setState({ security_seq: '18446744073709551615' });
    await expect(
      f.service.setLinkEnabled(context, change('9007199254740994', '2', true)),
    ).rejects.toThrow();
  });
  it('denies disabled/unsealed policy, disabled links and impossible future sequences', async () => {
    const f = await opened(),
      s = f.snapshot(),
      attempt = { begin_seq: '2', emergency_epoch: '0' };
    for (const state of [
      { ...s.state, enabled: false },
      { ...s.state, pilot_sealed: false },
    ])
      expect(() => validatePortalLoginContext(state, s.links[0], attempt)).toThrow();
    expect(() =>
      validatePortalLoginContext(s.state, { ...s.links[0], status: 'disabled' }, attempt),
    ).toThrow();
    expect(() =>
      validatePortalLoginContext(s.state, s.links[0], { ...attempt, begin_seq: '3' }),
    ).toThrow();
  });
  it('receipts contain actor, normalized request, revisions and result without credentials', async () => {
    const f = await sealed(),
      receipt = f.snapshot().receipts[0];
    expect(receipt.actorId).toBe(actorId);
    expect(receipt.details.request.actorId).toBe(actorId);
    expect(receipt.details.beforeRevision).toBe('0');
    expect(receipt.details.result.revision).toBe('1');
    expect(JSON.stringify(receipt)).not.toContain(context.sessionHash);
    expect(JSON.stringify(receipt)).not.toContain('subject');
  });
  it('keeps immutable before/after state and link evidence through later mutations', async () => {
    const f = await opened();
    await f.service.setLinkEnabled(context, change('2', '1', false));
    const receipt = f.snapshot().receipts[2];
    expect(receipt.details.before.state).toMatchObject({
      enabled: true,
      security_seq: '2',
      emergency_epoch: '0',
    });
    expect(receipt.details.before.links[1]).toMatchObject({
      user_id: userB,
      instructor_id: 2,
      status: 'enabled',
      min_login_seq: '1',
    });
    expect(receipt.details.after.links[1]).toMatchObject({
      status: 'disabled',
      min_login_seq: '3',
      revision: '2',
    });
    await f.service.setLinkEnabled(context, change('3', '2', true));
    expect(f.snapshot().receipts[2]).toEqual(receipt);
  });
});
