// PREPARED ONLY. Run this file alone, on a NEW accredited disposable instance,
// with separate owner authorization. RUN_DB_TESTS alone never grants DB access.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { disposableDatabase } from '../server/disposable-database';
import { pool, execute, query } from '../server/db';
import { migrate } from '../server/migrate';
import { createMysqlPortalUnitOfWork } from '../server/portal-policy';
import { createPortalAccessService } from '../server/portal-access';
import type { PortalContext, PortalMember, PortalUnitOfWork } from '../shared/portal';

const actor = randomUUID(),
  otherAdmin = randomUUID(),
  a = randomUUID(),
  b = randomUUID(),
  third = randomUUID();
const actorHash = randomBytes(32).toString('hex');
const context: PortalContext = { userId: actor, sessionHash: actorHash };
const run = createMysqlPortalUnitOfWork();
const service = createPortalAccessService(run, randomBytes(32));
let members: PortalMember[] = [];
let legacyDDL: unknown;
const adminSession = randomBytes(32).toString('hex');
const portalA = randomBytes(32).toString('hex'),
  portalB = randomBytes(32).toString('hex');
const hash = () => createHash('sha256').update(randomBytes(32)).digest('hex');

afterAll(async () => {
  await pool.end();
});
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')(
  'PWA-1B.1 accredited MySQL only (not executed in implementation)',
  () => {
    beforeAll(async () => {
      expect(process.env.DB_NAME).toBe(disposableDatabase());
      const tables = await query('SHOW TABLES');
      expect(tables.map((r) => Object.values(r)[0])).toEqual(['prisma_test_disposable_marker']);
      await migrate('020.sql');
      legacyDDL = await query('SHOW CREATE TABLE admin_sessions');
      // Simulate both partial-DDL families before installing on this new schema.
      await execute('CREATE TABLE portal_access_state (probe INT)');
      try {
        await expect(migrate('021.sql')).rejects.toThrow('parcial');
      } finally {
        await execute('DROP TABLE portal_access_state');
      }
      await execute('ALTER TABLE identity_audit_events ADD COLUMN details_json JSON NULL');
      try {
        await expect(migrate('021.sql')).rejects.toThrow('parcial');
      } finally {
        await execute('ALTER TABLE identity_audit_events DROP COLUMN details_json');
      }
      await migrate('021.sql');
      for (const id of [actor, otherAdmin, a, b, third]) {
        await execute(
          "INSERT INTO identity_users(id,display_name,status) VALUES (?,'Synthetic portal QA','enabled')",
          [id],
        );
        await execute(
          "INSERT INTO identity_external_accounts(provider,subject,user_id) VALUES ('google',?,?)",
          ['synthetic-' + id, id],
        );
        await execute('INSERT INTO identity_user_roles(user_id,role) VALUES (?,?)', [
          id,
          [actor, otherAdmin].includes(id) ? 'admin' : 'facilitator',
        ]);
      }
      const first = await execute("INSERT INTO instructors(name) VALUES ('Synthetic portal A')");
      const second = await execute("INSERT INTO instructors(name) VALUES ('Synthetic portal B')");
      members = [
        { userId: a, instructorId: first.insertId },
        { userId: b, instructorId: second.insertId },
      ];
      await execute(
        'UPDATE identity_institution SET initialized=1,admin_one=?,admin_two=? WHERE id=1',
        [actor, otherAdmin],
      );
    });
    beforeEach(async () => {
      // This suite owns the entire new schema, verified above. Driver accreditation
      // is repeated on every connection, including these synthetic resets.
      await execute('DELETE FROM identity_portal_oidc_attempts');
      await execute('DELETE FROM identity_instructor_links');
      await execute('DELETE FROM identity_audit_events');
      await execute('DELETE FROM identity_sessions');
      await execute(
        'UPDATE portal_access_state SET enabled=0,pilot_sealed=0,revision=0,security_seq=0,emergency_epoch=0 WHERE id=1',
      );
      await execute("UPDATE identity_users SET status='enabled' WHERE id IN (?,?,?,?,?)", [
        actor,
        otherAdmin,
        a,
        b,
        third,
      ]);
      await execute(
        'UPDATE instructors SET active=1 WHERE id IN (?,?)',
        members.map((m) => m.instructorId),
      );
      await execute(
        "INSERT IGNORE INTO identity_user_roles(user_id,role) VALUES (?,'facilitator'),(?,'facilitator')",
        [a, b],
      );
      await execute("DELETE FROM identity_user_roles WHERE user_id IN (?,?) AND role='admin'", [
        a,
        b,
      ]);
      for (const id of [a, b])
        await execute(
          "INSERT IGNORE INTO identity_external_accounts(provider,subject,user_id) VALUES ('google',?,?)",
          ['synthetic-' + id, id],
        );
      for (const [token, userId, app] of [
        [actorHash, actor, 'crm'],
        [adminSession, b, 'crm'],
        [portalA, a, 'portal'],
        [portalB, b, 'portal'],
      ])
        await execute(
          'INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at) VALUES (?,?,?,0,?)',
          [token, userId, app, Date.now() + 3600000],
        );
    });
    async function seal() {
      await service.sealPilot(context, randomUUID(), await service.preparePilot(context, members));
    }
    async function open() {
      await seal();
      await service.setPortalEnabled(context, {
        operationId: randomUUID(),
        expectedRevision: '1',
        enabled: true,
      });
    }
    const change = (revision: string, linkRevision: string, enabled: boolean) => ({
      operationId: randomUUID(),
      expectedRevision: revision,
      expectedLinkRevision: linkRevision,
      userId: b,
      enabled,
    });

    it('installs/replays aditively and keeps legacy DDL and initial policy intact', async () => {
      await migrate('021.sql');
      expect(await query('SHOW CREATE TABLE admin_sessions')).toEqual(legacyDDL);
      const [s] = await query('SELECT * FROM portal_access_state');
      expect([s.enabled, s.pilot_sealed, s.admissions_open]).toEqual([0, 0, 0]);
      expect(await query("SELECT name FROM schema_migrations WHERE name='021.sql'")).toHaveLength(
        1,
      );
      // Legacy audit insertion still works with both additive columns omitted.
      await execute(
        "INSERT INTO identity_audit_events(user_id,event) VALUES (?,'synthetic.legacy')",
        [a],
      );
    });
    it('enforces FK, one-to-one uniqueness, two reserved slots and status constraints', async () => {
      await seal();
      await expect(
        execute('UPDATE identity_instructor_links SET instructor_id=? WHERE user_id=?', [
          members[0].instructorId,
          b,
        ]),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(
        execute('UPDATE identity_instructor_links SET instructor_id=4294967295 WHERE user_id=?', [
          a,
        ]),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
      await expect(
        execute('UPDATE identity_instructor_links SET user_id=? WHERE user_id=?', [
          randomUUID(),
          a,
        ]),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
      await expect(
        execute('UPDATE identity_instructor_links SET pilot_slot=3 WHERE user_id=?', [a]),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      const [aSlot] = await query(
        'SELECT pilot_slot FROM identity_instructor_links WHERE user_id=?',
        [a],
      );
      await expect(
        execute('UPDATE identity_instructor_links SET pilot_slot=? WHERE user_id=?', [
          aSlot.pilot_slot,
          b,
        ]),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(
        execute('UPDATE identity_instructor_links SET user_id=? WHERE user_id=?', [a, b]),
      ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(
        execute("UPDATE identity_instructor_links SET status='invalid' WHERE user_id=?", [a]),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      await expect(
        execute('DELETE FROM instructors WHERE id=?', [members[0].instructorId]),
      ).rejects.toMatchObject({ code: 'ER_ROW_IS_REFERENCED_2' });
      // Remove unrelated FK dependents so the new link FK alone blocks deletion.
      await execute('DELETE FROM identity_sessions WHERE user_id=?', [a]);
      await execute('DELETE FROM identity_user_roles WHERE user_id=?', [a]);
      await execute('DELETE FROM identity_external_accounts WHERE user_id=?', [a]);
      await expect(execute('DELETE FROM identity_users WHERE id=?', [a])).rejects.toMatchObject({
        code: 'ER_ROW_IS_REFERENCED_2',
      });
      await expect(
        execute('UPDATE portal_access_state SET admissions_open=1 WHERE id=1'),
      ).rejects.toThrow();
    });
    it.each(['disabled', 'role', 'instructor', 'google'])(
      'revalidates %s eligibility after preparation',
      async (kind) => {
        const plan = await service.preparePilot(context, members);
        if (kind === 'disabled')
          await execute("UPDATE identity_users SET status='disabled' WHERE id=?", [a]);
        if (kind === 'role')
          await execute("DELETE FROM identity_user_roles WHERE user_id=? AND role='facilitator'", [
            a,
          ]);
        if (kind === 'instructor')
          await execute('UPDATE instructors SET active=0 WHERE id=?', [members[0].instructorId]);
        if (kind === 'google')
          await execute(
            "DELETE FROM identity_external_accounts WHERE user_id=? AND provider='google'",
            [a],
          );
        await expect(service.sealPilot(context, randomUUID(), plan)).rejects.toThrow();
        expect(await query('SELECT * FROM identity_instructor_links')).toHaveLength(0);
      },
    );
    it('supports dual-role and facilitator-only identities without admin bypass', async () => {
      await execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'admin')", [a]);
      await execute("DELETE FROM identity_user_roles WHERE user_id=? AND role='facilitator'", [a]);
      await expect(service.preparePilot(context, members)).rejects.toThrow();
      await execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'facilitator')", [a]);
      await expect(service.preparePilot(context, members)).resolves.toBeDefined();
    });
    it('denies revoked, expired, wrong-application and foreign administrative sessions', async () => {
      for (const c of [
        { userId: actor, sessionHash: portalA },
        { userId: a, sessionHash: actorHash },
      ])
        await expect(service.preparePilot(c, members)).rejects.toThrow();
      await execute('UPDATE identity_sessions SET revoked_at=1 WHERE token_hash=?', [actorHash]);
      await expect(service.preparePilot(context, members)).rejects.toThrow();
      await execute(
        'UPDATE identity_sessions SET revoked_at=NULL,expires_at=1 WHERE token_hash=?',
        [actorHash],
      );
      await expect(service.preparePilot(context, members)).rejects.toThrow();
    });
    it('preserves A login through B revoke/readmit and never revokes CRM', async () => {
      await open();
      const begin = { begin_seq: '2', emergency_epoch: '0' };
      await service.setLinkEnabled(context, change('2', '1', false));
      await service.setLinkEnabled(context, change('3', '2', true));
      await expect(service.validateLogin(a, begin)).resolves.toEqual({
        userId: a,
        instructorId: members[0].instructorId,
      });
      await expect(service.validateLogin(b, begin)).rejects.toThrow();
      await expect(service.validateLogin(b, { ...begin, begin_seq: '4' })).resolves.toBeDefined();
      const sessions = await query('SELECT token_hash,revoked_at FROM identity_sessions');
      expect(sessions.find((s) => s.token_hash === portalA)?.revoked_at).toBeNull();
      expect(sessions.find((s) => s.token_hash === portalB)?.revoked_at).not.toBeNull();
      expect(sessions.find((s) => s.token_hash === adminSession)?.revoked_at).toBeNull();
    });
    it('serializes same-ID retries and rejects changed parameters transactionally', async () => {
      await open();
      const input = change('2', '1', false);
      const [one, two] = await Promise.all([
        service.setLinkEnabled(context, input),
        service.setLinkEnabled(context, input),
      ]);
      expect(one).toEqual(two);
      expect(
        await query('SELECT id FROM identity_audit_events WHERE operation_id=?', [
          input.operationId,
        ]),
      ).toHaveLength(1);
      await expect(service.setLinkEnabled(context, { ...input, enabled: true })).rejects.toThrow();
    });
    it('enforces unique operation receipts, structured details and bounded audit evidence', async () => {
      const operation = randomUUID();
      const insert = (id: string, details: string | null) =>
        execute(
          "INSERT INTO identity_audit_events(user_id,actor_id,event,operation_id,details_json) VALUES (?,?,'synthetic.receipt',?,?)",
          [actor, actor, id, details],
        );
      await insert(operation, '{}');
      await expect(insert(operation, '{}')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(insert(randomUUID(), null)).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
      await expect(insert(randomUUID(), '[]')).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
      await expect(insert('invalid', '{}')).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
      await expect(
        insert(randomUUID(), JSON.stringify({ payload: 'x'.repeat(17000) })),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    });
    it('allows only one optimistic writer and retains two immutable members', async () => {
      await open();
      const results = await Promise.allSettled([
        service.setLinkEnabled(context, change('2', '1', false)),
        service.setLinkEnabled(context, { ...change('2', '1', false), userId: a }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await expect(
        service.preparePilot(context, [
          { userId: third, instructorId: members[0].instructorId },
          members[1],
        ]),
      ).rejects.toThrow();
      expect(await query('SELECT user_id FROM identity_instructor_links')).toHaveLength(2);
    });
    it.each(['check-first', 'revoke-first'])(
      'orders authorization and revocation with explicit gates: %s',
      async (order) => {
        await open();
        let entered!: () => void, release!: () => void;
        const acquired = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const gated: PortalUnitOfWork = (work, scope) =>
          run(async (tx) => {
            entered();
            await gate;
            return work(tx);
          }, scope);
        const first = createPortalAccessService(gated, randomBytes(32));
        const begin = { begin_seq: '2', emergency_epoch: '0' };
        if (order === 'check-first') {
          const checked = first.validateLogin(b, begin);
          await acquired;
          const revoke = service.setLinkEnabled(context, change('2', '1', false));
          release();
          await checked;
          await revoke;
        } else {
          const revoke = first.setLinkEnabled(context, change('2', '1', false));
          await acquired;
          const checked = expect(service.validateLogin(b, begin)).rejects.toThrow();
          release();
          await revoke;
          await checked;
        }
        await expect(service.validateLogin(b, begin)).rejects.toThrow();
        await expect(service.validateLogin(a, begin)).resolves.toBeDefined();
      },
    );
    it('rolls back real MySQL writes when the audit insert fails and retries safely', async () => {
      await open();
      const input = change('2', '1', false);
      const fault: PortalUnitOfWork = (work, scope) =>
        run(
          (tx) =>
            work({ ...tx, audit: (receipt) => tx.audit({ ...receipt, actorId: randomUUID() }) }),
          scope,
        );
      const failing = createPortalAccessService(fault, randomBytes(32));
      await expect(failing.setLinkEnabled(context, input)).rejects.toThrow();
      expect(
        (await query('SELECT status FROM identity_instructor_links WHERE user_id=?', [b]))[0]
          .status,
      ).toBe('enabled');
      expect(
        (await query('SELECT revoked_at FROM identity_sessions WHERE token_hash=?', [portalB]))[0]
          .revoked_at,
      ).toBeNull();
      expect(
        await query('SELECT id FROM identity_audit_events WHERE operation_id=?', [
          input.operationId,
        ]),
      ).toHaveLength(0);
      await service.setLinkEnabled(context, input);
    });
    it('emergency epoch survives reopen and invalidates both identities only in portal', async () => {
      await open();
      await service.setPortalEnabled(context, {
        operationId: randomUUID(),
        expectedRevision: '2',
        enabled: false,
      });
      await service.setPortalEnabled(context, {
        operationId: randomUUID(),
        expectedRevision: '3',
        enabled: true,
      });
      for (const userId of [a, b])
        await expect(
          service.validateLogin(userId, { begin_seq: '2', emergency_epoch: '0' }),
        ).rejects.toThrow();
      expect(
        await query(
          "SELECT token_hash FROM identity_sessions WHERE application='portal' AND revoked_at IS NULL",
        ),
      ).toHaveLength(0);
      expect(
        await query(
          "SELECT token_hash FROM identity_sessions WHERE application='crm' AND revoked_at IS NULL",
        ),
      ).toHaveLength(2);
    });
    it('constrains OIDC evidence lifecycle and unique issued-session association', async () => {
      const first = randomUUID();
      async function attempt(id: string, state = hash(), browser = hash()) {
        await execute(
          "INSERT INTO identity_portal_oidc_attempts(id,provider,application,configuration_hash,state_hash,browser_hash,nonce,pkce_key_id,pkce_encrypted,begin_seq,emergency_epoch,status,created_at,expires_at) VALUES (?,'google','portal',?,?,?,?,'synthetic',?,0,0,'pending',1000,2000)",
          [id, hash(), state, browser, 'n'.repeat(43), 'e'.repeat(95)],
        );
      }
      const state = hash(),
        browser = hash();
      await attempt(first, state, browser);
      await expect(attempt(randomUUID(), state)).rejects.toThrow();
      await expect(attempt(randomUUID(), hash(), browser)).rejects.toThrow();
      await expect(
        execute("UPDATE identity_portal_oidc_attempts SET application='crm' WHERE id=?", [first]),
      ).rejects.toThrow();
      await expect(
        execute('UPDATE identity_portal_oidc_attempts SET expires_at=301001 WHERE id=?', [first]),
      ).rejects.toThrow();
      await expect(
        execute(
          "UPDATE identity_portal_oidc_attempts SET status='claimed',claimed_at=1001 WHERE id=?",
          [first],
        ),
      ).rejects.toThrow();
      await execute(
        "UPDATE identity_portal_oidc_attempts SET status='claimed',claimed_at=1001,nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL WHERE id=?",
        [first],
      );
      await execute(
        "UPDATE identity_portal_oidc_attempts SET status='verified',verified_at=1002,subject='synthetic',token_issued_at=1000,token_expires_at=2000 WHERE id=?",
        [first],
      );
      await expect(
        execute(
          "UPDATE identity_portal_oidc_attempts SET status='consumed',consumed_at=1003 WHERE id=?",
          [first],
        ),
      ).rejects.toThrow();
      await execute(
        "UPDATE identity_portal_oidc_attempts SET status='consumed',consumed_at=1003,issued_session_hash=?,subject=NULL,token_issued_at=NULL,token_expires_at=NULL WHERE id=?",
        [portalA, first],
      );
      await expect(
        execute('DELETE FROM identity_sessions WHERE token_hash=?', [portalA]),
      ).rejects.toThrow();
      const [consumed] = await query('SELECT * FROM identity_portal_oidc_attempts WHERE id=?', [
        first,
      ]);
      expect(consumed.subject).toBeNull();
      expect(consumed.issued_session_hash).toBe(portalA);
      const second = randomUUID();
      await attempt(second);
      const consume = (session: string) =>
        execute(
          "UPDATE identity_portal_oidc_attempts SET status='consumed',claimed_at=1001,verified_at=1002,consumed_at=1003,nonce=NULL,pkce_key_id=NULL,pkce_encrypted=NULL,issued_session_hash=? WHERE id=?",
          [session, second],
        );
      await expect(consume(portalA)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(consume(hash())).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
      await expect(
        execute('UPDATE identity_portal_oidc_attempts SET expected_crm_user_id=? WHERE id=?', [
          randomUUID(),
          second,
        ]),
      ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
    });
  },
);
