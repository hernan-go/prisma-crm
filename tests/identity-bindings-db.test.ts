import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as db from '../server/db';
import * as identity from '../server/identity';
import { createBindingService, type BindingAuthority } from '../server/identity-bindings';
import { migrate } from '../server/migrate';
const operator = Symbol('synthetic privileged channel');
const authorized = new Map<object, string>();
const evidence = new Map<object, { subject: string; operationId: string; userId: string }>();
const adapter: BindingAuthority = {
  async authorize(context) {
    if (context === operator) return { kind: 'operator' };
    const id = authorized.get(context as object);
    if (!id) throw Error('Untrusted actor');
    return { kind: 'admin', userId: id };
  },
  async verifyCandidate(value, binding) {
    const proof = evidence.get(value as object);
    if (!proof || proof.operationId !== binding.operationId || proof.userId !== binding.userId)
      throw Error('Unverified proof');
    evidence.delete(value as object);
    return { provider: 'google', subject: proof.subject };
  },
};
const service = createBindingService(adapter);
let ids: [string, string];
let owned = false;
async function candidate(
  userId: string,
  purpose: 'initial' | 'replace' = 'initial',
  context: unknown = operator,
  subject = randomUUID(),
) {
  const issued = await service.issue(context, userId, purpose);
  const proof = {};
  evidence.set(proof, { subject, operationId: issued.operationId, userId });
  await service.submitCandidate(issued.operationId, userId, issued.code, proof);
  return { ...issued, subject };
}
async function initialize() {
  for (const id of ids) {
    const op = await candidate(id);
    await service.approve(operator, op.operationId, id);
  }
}
afterAll(() => db.pool.end());
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')(
  'Binding operations prisma_test synthetic only',
  () => {
    beforeAll(async () => {
      expect(process.env.DB_NAME).toBe('prisma_test');
      expect(['127.0.0.1', 'localhost', '::1']).toContain(process.env.DB_HOST || '127.0.0.1');
      expect((await db.query('SELECT DATABASE() name'))[0].name).toBe('prisma_test');
      await migrate('018.sql');
      const [s] = await db.query('SELECT * FROM identity_institution WHERE id=1');
      if (s.initialized || s.admin_one || s.admin_two)
        throw Error('Institution not empty; refusing shared fixture reset');
    });
    beforeEach(async () => {
      ids = [
        await identity.createIdentity('Synthetic A', null),
        await identity.createIdentity('Synthetic B', null),
      ];
      owned = true;
      await service.configure(operator, ids);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      if (!owned) return;
      const [s] = await db.query('SELECT * FROM identity_institution WHERE id=1');
      expect([s.admin_one, s.admin_two]).toEqual(ids);
      // Test-only teardown of the exact synthetic institution owned by this test.
      // There is no equivalent reset operation in the service.
      await db.execute(
        'UPDATE identity_institution SET initialized=FALSE,legacy_retired=FALSE,admin_one=NULL,admin_two=NULL WHERE id=1 AND admin_one=? AND admin_two=?',
        ids,
      );
      for (const id of ids) {
        await db.execute('DELETE FROM identity_binding_operations WHERE user_id=?', [id]);
      }
      for (const id of ids)
        await db.execute('DELETE FROM identity_audit_events WHERE user_id=? OR actor_id=?', [
          id,
          id,
        ]);
      for (const id of ids) {
        for (const table of [
          'identity_sessions',
          'identity_user_roles',
          'identity_external_accounts',
        ])
          await db.execute('DELETE FROM ' + table + ' WHERE user_id=?', [id]);
        await db.execute('DELETE FROM identity_users WHERE id=?', [id]);
      }
      owned = false;
      authorized.clear();
      evidence.clear();
    });
    it('pending grants nothing, rejects arbitrary evidence/UUID exchange, approval is single-use and bootstrap closes', async () => {
      const op = await candidate(ids[0]);
      expect((await identity.getIdentity(ids[0]))?.status).toBe('disabled');
      await expect(
        identity.linkExternalIdentity(ids[0], 'google', randomUUID(), null),
      ).rejects.toThrow('supervisada');
      await expect(identity.setIdentityStatus(ids[0], 'enabled', null)).rejects.toThrow(
        'pendiente',
      );
      await expect(identity.setIdentityRole(ids[0], 'admin', true, null)).rejects.toThrow(
        'pendiente',
      );
      await expect(identity.createIdentitySession(ids[0], 'crm', 1000)).rejects.toThrow();
      await expect(
        service.submitCandidate(op.operationId, ids[0], op.code, { subject: 'forged' }),
      ).rejects.toThrow();
      await expect(service.approve(operator, op.operationId, ids[1])).rejects.toThrow();
      await expect(service.approve({ kind: 'operator' }, op.operationId, ids[0])).rejects.toThrow();
      const outcomes = await Promise.allSettled([
        service.approve(operator, op.operationId, ids[0]),
        service.approve(operator, op.operationId, ids[0]),
      ]);
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const second = await candidate(ids[1]);
      await service.approve(operator, second.operationId, ids[1]);
      expect(
        (await db.query('SELECT initialized FROM identity_institution WHERE id=1'))[0].initialized,
      ).toBe(1);
      await expect(service.configure(operator, ids)).rejects.toThrow();
      await expect(service.issue(operator, ids[0], 'initial')).rejects.toThrow();
      expect(
        (
          await db.query('SELECT code_hash FROM identity_binding_operations WHERE id=?', [
            op.operationId,
          ])
        )[0].code_hash,
      ).not.toBe(op.code);
    });
    it('expired/revoked/replaced authorization and duplicate subject cannot be approved', async () => {
      const bad = await service.issue(operator, ids[0], 'initial');
      const badProof = {};
      evidence.set(badProof, {
        subject: randomUUID(),
        operationId: bad.operationId,
        userId: ids[0],
      });
      await expect(
        service.submitCandidate(bad.operationId, ids[0], '0'.repeat(64), badProof),
      ).rejects.toThrow();
      const swapProof = {};
      evidence.set(swapProof, {
        subject: randomUUID(),
        operationId: bad.operationId,
        userId: ids[0],
      });
      await expect(
        service.submitCandidate(bad.operationId, ids[1], bad.code, swapProof),
      ).rejects.toThrow();
      const expired = await candidate(ids[0]);
      await db.execute(
        'UPDATE identity_binding_operations SET created_at=?,expires_at=? WHERE id=?',
        [Date.now() - 2000, Date.now() - 1000, expired.operationId],
      );
      await expect(service.approve(operator, expired.operationId, ids[0])).rejects.toThrow();
      const revoked = await candidate(ids[0]);
      await service.revoke(operator, revoked.operationId, ids[0]);
      await expect(service.approve(operator, revoked.operationId, ids[0])).rejects.toThrow();
      const first = await candidate(ids[0]);
      await service.approve(operator, first.operationId, ids[0]);
      await expect(candidate(ids[1], 'initial', operator, first.subject)).rejects.toThrow();
      expect((await identity.getIdentity(ids[1]))?.status).toBe('disabled');
    });
    it('replacement preserves UUID, revokes sessions; audit failure rolls back association and consumption', async () => {
      await initialize();
      const context = {};
      authorized.set(context, ids[0]);
      const previous = await db.query(
        'SELECT subject FROM identity_external_accounts WHERE user_id=?',
        [ids[1]],
      );
      const session = await identity.createIdentitySession(ids[1], 'crm', 10000);
      const op = await candidate(ids[1], 'replace', context);
      const original = db.execute;
      vi.spyOn(db, 'execute').mockImplementation(async (sql, values, connection) => {
        if (
          sql.includes('INSERT INTO identity_audit_events') &&
          values?.includes('binding.replaced')
        )
          throw Error('Injected audit failure');
        return original(sql, values, connection);
      });
      await expect(service.approve(context, op.operationId, ids[1])).rejects.toThrow('Injected');
      vi.restoreAllMocks();
      expect(
        await db.query('SELECT subject FROM identity_external_accounts WHERE user_id=?', [ids[1]]),
      ).toEqual(previous);
      expect(await identity.authenticateIdentitySession(session.token, 'crm')).toBeDefined();
      await service.approve(context, op.operationId, ids[1]);
      expect((await identity.findExternalIdentity('google', op.subject))?.id).toBe(ids[1]);
      expect(await identity.authenticateIdentitySession(session.token, 'crm')).toBeUndefined();
      await expect(service.issue(context, ids[0], 'replace')).rejects.toThrow();
    });
    it('concurrent suspensions retain a last bound admin; legacy role mutation cannot bypass protection', async () => {
      await initialize();
      const a = {},
        b = {};
      authorized.set(a, ids[0]);
      authorized.set(b, ids[1]);
      const outcomes = await Promise.allSettled([
        service.restrict(a, ids[1], 'suspend'),
        service.restrict(b, ids[0], 'suspend'),
      ]);
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const users = await Promise.all(ids.map((id) => identity.getIdentity(id)));
      const remaining = users.find((u) => u?.status === 'enabled')!;
      await expect(identity.setIdentityRole(remaining.id, 'admin', false, null)).rejects.toThrow(
        'conservarse',
      );
      await expect(identity.setIdentityStatus(remaining.id, 'disabled', null)).rejects.toThrow(
        'conservarse',
      );
      const context = remaining.id === ids[0] ? a : b;
      await expect(service.restrict(context, remaining.id, 'unlink')).rejects.toThrow(
        'conservarse',
      );
      await expect(service.restrict(context, remaining.id, 'remove-role')).rejects.toThrow(
        'conservarse',
      );
    });
    it('018 replay and missing registration detection do not change institutional data', async () => {
      const before = await db.query('SELECT * FROM identity_institution');
      await migrate('018.sql');
      await db.execute("DELETE FROM schema_migrations WHERE name='018.sql'");
      try {
        await expect(migrate('018.sql')).rejects.toThrow('parciales');
      } finally {
        await db.execute("INSERT INTO schema_migrations(name) VALUES ('018.sql')");
      }
      expect(await db.query('SELECT * FROM identity_institution')).toEqual(before);
    });
    it('rejects expiration during authorization using the database clock without granting privileges', async () => {
      const op = await candidate(ids[0]);
      await db.execute(
        'UPDATE identity_binding_operations SET expires_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)+1000 WHERE id=?',
        [op.operationId],
      );
      const authorize = adapter.authorize.bind(adapter);
      vi.spyOn(adapter, 'authorize').mockImplementation(async (context, action, connection) => {
        const actor = await authorize(context, action, connection);
        if (action === 'approve') await new Promise((resolve) => setTimeout(resolve, 1200));
        return actor;
      });
      await expect(service.approve(operator, op.operationId, ids[0])).rejects.toThrow('al aprobar');
      expect(
        await db.query('SELECT * FROM identity_external_accounts WHERE user_id=?', [ids[0]]),
      ).toHaveLength(0);
      expect(
        await db.query('SELECT * FROM identity_user_roles WHERE user_id=?', [ids[0]]),
      ).toHaveLength(0);
      expect((await identity.getIdentity(ids[0]))?.status).toBe('disabled');
      expect(
        (
          await db.query('SELECT consumed_at FROM identity_binding_operations WHERE id=?', [
            op.operationId,
          ])
        )[0].consumed_at,
      ).toBeNull();
    });
    it('rolls back a successful claim when the reported affected row count prevents approval', async () => {
      const op = await candidate(ids[0]);
      const original = db.execute;
      vi.spyOn(db, 'execute').mockImplementation(async (sql, values, connection) => {
        const result = await original(sql, values, connection);
        return sql.includes('SET consumed_at=') ? { ...result, affectedRows: 0 } : result;
      });
      await expect(service.approve(operator, op.operationId, ids[0])).rejects.toThrow('al aprobar');
      vi.restoreAllMocks();
      expect(
        (
          await db.query('SELECT consumed_at FROM identity_binding_operations WHERE id=?', [
            op.operationId,
          ])
        )[0].consumed_at,
      ).toBeNull();
      expect(
        await db.query('SELECT * FROM identity_external_accounts WHERE user_id=?', [ids[0]]),
      ).toHaveLength(0);
      expect(
        await db.query('SELECT * FROM identity_user_roles WHERE user_id=?', [ids[0]]),
      ).toHaveLength(0);
      expect((await identity.getIdentity(ids[0]))?.status).toBe('disabled');
      expect(
        await db.query(
          "SELECT * FROM identity_audit_events WHERE user_id=? AND event='binding.initial.approved'",
          [ids[0]],
        ),
      ).toHaveLength(0);
      await service.approve(operator, op.operationId, ids[0]);
    });
  },
);
