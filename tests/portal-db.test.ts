// PREPARED ONLY. Run this file alone, on a NEW accredited disposable instance,
// with separate owner authorization. RUN_DB_TESTS alone never grants DB access.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { disposableDatabase } from '../server/disposable-database';
import { pool, execute, query, transaction } from '../server/db';
import { mysqlPortalOidcStore } from '../server/portal-oidc-store';
import { setIdentityRole, setIdentityStatus, revokeIdentitySessions } from '../server/identity';
import { instructorSave } from '../server/offerings';
import { createBindingService } from '../server/identity-bindings';
import { lockInstitution } from '../server/identity-policy';
import { preparePortalMutation } from '../server/portal-hooks';
import { opaque, digest } from '../server/oidc-crypto';
import type { PortalOidcAttempt } from '../server/portal-oidc-contracts';
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
      await execute('UPDATE identity_institution SET initialized=1,admin_one=?,admin_two=? WHERE id=1', [actor,otherAdmin]);
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
      for (const id of [a,b])
        await execute("UPDATE identity_external_accounts SET subject=? WHERE user_id=? AND provider='google'", ['synthetic-'+id,id]);
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
    async function linkBarrier(userId = a) {
      return (
        await query(
          'SELECT CAST(min_login_seq AS CHAR) seq FROM identity_instructor_links WHERE user_id=?',
          [userId],
        )
      )[0].seq as string;
    }
    it('Block3 status rehabilitation and multiroles preserve selective barriers', async () => {
      await open();
      const initial = await linkBarrier(),
        untouched = await linkBarrier(b);
      await setIdentityStatus(a, 'disabled', actor);
      const disabled = await linkBarrier();
      expect(BigInt(disabled)).toBeGreaterThan(BigInt(initial));
      await setIdentityStatus(a, 'enabled', actor);
      const enabled = await linkBarrier();
      expect(BigInt(enabled)).toBeGreaterThan(BigInt(disabled));
      await setIdentityStatus(a, 'enabled', actor);
      expect(await linkBarrier()).toBe(enabled);
      await setIdentityRole(a, 'admin', true, actor);
      expect(
        (
          await query('SELECT role FROM identity_user_roles WHERE user_id=? ORDER BY role', [a])
        ).map((r) => r.role),
      ).toEqual(['admin', 'facilitator']);
      expect(await linkBarrier(b)).toBe(untouched);
      expect(
        (
          await query('SELECT revoked_at FROM identity_sessions WHERE token_hash=?', [adminSession])
        )[0].revoked_at,
      ).toBeNull();
    });
    it('Block3 instructor active changes invalidate but renaming does not', async () => {
      await open();
      const id = members[0].instructorId;
      const [row] = await query('SELECT * FROM instructors WHERE id=?', [id]);
      const original = await linkBarrier();
      await instructorSave({ ...row, active: true, name: 'Synthetic renamed' }, id);
      expect(await linkBarrier()).toBe(original);
      await instructorSave({ ...row, active: false }, id);
      const disabled = await linkBarrier();
      expect(BigInt(disabled)).toBeGreaterThan(BigInt(original));
      await instructorSave({ ...row, active: true }, id);
      expect(BigInt(await linkBarrier())).toBeGreaterThan(BigInt(disabled));
    });
    it('Block3 failed audit rolls back role, barrier and session revocation together', async () => {
      await open();
      const initial = await linkBarrier();
      // Invalid actor FK forces original audit to fail after its mutation/revocation.
      await expect(setIdentityRole(a, 'admin', true, randomUUID())).rejects.toThrow();
      expect(await linkBarrier()).toBe(initial);
      expect(
        await query("SELECT role FROM identity_user_roles WHERE user_id=? AND role='admin'", [a]),
      ).toHaveLength(0);
      expect(
        (await query('SELECT revoked_at FROM identity_sessions WHERE token_hash=?', [portalA]))[0]
          .revoked_at,
      ).toBeNull();
    });
    it('Block3 concurrent identity changes serialize and explicit revocation blocks old evidence', async () => {
      await open();
      const initial = await linkBarrier();
      await Promise.all([
        setIdentityRole(a, 'admin', true, actor),
        setIdentityRole(a, 'participant', true, actor),
      ]);
      expect(BigInt(await linkBarrier())).toBe(BigInt(initial) + 2n);
      const before = await linkBarrier();
      await revokeIdentitySessions(a, actor);
      expect(BigInt(await linkBarrier())).toBe(BigInt(before) + 1n);
    });
    it('Block3 supervised Google replacement uses the same barrier hook', async () => {
      await open();
      // Institutional actor is itself a synthetic pilot member in this scenario.
      await execute('UPDATE identity_institution SET admin_one=? WHERE id=1', [a]);
      await setIdentityRole(a, 'admin', true, actor);
      const service = createBindingService({
        authorize: async () => ({ kind: 'operator' }),
        verifyCandidate: async () => ({
          provider: 'google',
          subject: 'synthetic-replacement-' + a,
        }),
      });
      const before = await linkBarrier();
      const op = await service.issue(null, a, 'replace');
      await service.submitCandidate(op.operationId, a, op.code, {});
      expect(await linkBarrier()).toBe(before);
      await service.approve(null, op.operationId, a);
      expect(BigInt(await linkBarrier())).toBeGreaterThan(BigInt(before));
    });
    it('Block3 rollback after hook restores eligibility, audit, barrier and session together', async () => {
      await open();
      const before = await linkBarrier();
      const auditBefore = await query('SELECT id FROM identity_audit_events ORDER BY id');
      await expect(
        transaction(async (db) => {
          await lockInstitution(db);
          const hook = await preparePortalMutation(db);
          await execute("UPDATE identity_users SET status='disabled' WHERE id=?", [a], db);
          await hook.finish();
          throw Error('synthetic failure after hook');
        }),
      ).rejects.toThrow('synthetic failure');
      expect(await linkBarrier()).toBe(before);
      expect(await query('SELECT id FROM identity_audit_events ORDER BY id')).toEqual(auditBefore);
      expect((await query('SELECT status FROM identity_users WHERE id=?', [a]))[0].status).toBe(
        'enabled',
      );
      expect(
        (await query('SELECT revoked_at FROM identity_sessions WHERE token_hash=?', [portalA]))[0]
          .revoked_at,
      ).toBeNull();
    });
    it('Block3 instructor and identity changes serialize with callback evidence', async () => {
      await open();
      const attempt = oidcAttempt();
      await oidcStore.create(attempt);
      await oidcStore.claim(attempt.stateHash, attempt);
      const [row] = await query('SELECT * FROM instructors WHERE id=?', [members[0].instructorId]);
      const before = await linkBarrier();
      await Promise.all([
        instructorSave({ ...row, active: false }, members[0].instructorId),
        setIdentityRole(a, 'participant', true, actor),
        oidcStore.verify(attempt, proof()),
      ]);
      const evidence = await transaction((db) => oidcStore.readEvidenceForFinish(db, attempt));
      expect(BigInt(await linkBarrier())).toBe(BigInt(before) + 2n);
      expect(BigInt(evidence.beginSeq)).toBeLessThan(BigInt(await linkBarrier()));
    });
    // Block 2 integration cases: same accredited suite/baseline, never conserved DBs.
    function oidcAttempt(): PortalOidcAttempt {
      return {
        id: randomUUID(),
        configurationHash: hash(),
        stateHash: hash(),
        browserHash: digest(opaque()),
        nonce: opaque(),
        keyId: 'synthetic',
        encrypted: 'a'.repeat(95),
        context: { purpose: 'portal-login', expectedCrmUserId: a },
      };
    }
    const oidcStore = mysqlPortalOidcStore();
    const proof = () => ({
      subject: 'synthetic-' + a,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 300000,
      authenticationTime: null,
    });
    it('portal OIDC persists exact snapshots, unique correlation and no sessions', async () => {
      await open();
      const attempt = oidcAttempt();
      const before = await query('SELECT token_hash FROM identity_sessions ORDER BY token_hash');
      await oidcStore.create(attempt);
      const [row] = await query('SELECT * FROM identity_portal_oidc_attempts WHERE id=?', [
        attempt.id,
      ]);
      expect(row.expires_at - row.created_at).toBe(300000);
      expect(row.expected_crm_user_id).toBe(a);
      expect(String(row.begin_seq)).toBe('2');
      await expect(oidcStore.create(attempt)).rejects.toThrow();
      await expect(
        oidcStore.create({ ...oidcAttempt(), browserHash: attempt.browserHash }),
      ).rejects.toThrow();
      expect(await query('SELECT token_hash FROM identity_sessions ORDER BY token_hash')).toEqual(
        before,
      );
    });
    it('portal OIDC has one concurrent claim, wipes secrets and rejects replay', async () => {
      await open();
      const attempt = oidcAttempt();
      await oidcStore.create(attempt);
      const results = await Promise.allSettled([
        oidcStore.claim(attempt.stateHash, attempt),
        oidcStore.claim(attempt.stateHash, attempt),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const [row] = await query('SELECT * FROM identity_portal_oidc_attempts WHERE id=?', [
        attempt.id,
      ]);
      expect(row).toMatchObject({
        status: 'claimed',
        nonce: null,
        pkce_key_id: null,
        pkce_encrypted: null,
      });
      await oidcStore.verify(attempt, proof());
      await expect(oidcStore.claim(attempt.stateHash, attempt)).rejects.toThrow();
      const evidence = await transaction((db) => oidcStore.readEvidenceForFinish(db, attempt));
      expect(evidence).toMatchObject({
        subject: 'synthetic-' + a,
        beginSeq: '2',
        emergencyEpoch: '0',
        expectedCrmUserId: a,
      });
    });
    it('portal OIDC rejects mismatched configuration and preserves individual barrier context for finish', async () => {
      await open();
      const attempt = oidcAttempt();
      await oidcStore.create(attempt);
      await expect(
        oidcStore.claim(attempt.stateHash, { ...attempt, configurationHash: hash() }),
      ).rejects.toThrow();
      await expect(
        oidcStore.claim(attempt.stateHash, { ...attempt, browserHash: hash() }),
      ).rejects.toThrow();
      await oidcStore.claim(attempt.stateHash, attempt);
      await service.revokePortalSessions(context, {
        operationId: randomUUID(),
        expectedRevision: '2',
        userId: a,
        expectedLinkRevision: '1',
      });
      // Cryptographic proof may still be verified, but is NOT an authorization.
      await oidcStore.verify(attempt, proof());
      const evidence = await transaction((db) => oidcStore.readEvidenceForFinish(db, attempt));
      const [link] = await query(
        'SELECT CAST(min_login_seq AS CHAR) barrier FROM identity_instructor_links WHERE user_id=?',
        [a],
      );
      expect(BigInt(evidence.beginSeq)).toBeLessThan(BigInt(link.barrier));
      expect(
        (
          await query(
            'SELECT status,issued_session_hash FROM identity_portal_oidc_attempts WHERE id=?',
            [attempt.id],
          )
        )[0],
      ).toEqual({ status: 'verified', issued_session_hash: null });
    });
    it('portal OIDC cancellation wins against verification and remains idempotent', async () => {
      await open();
      const attempt = oidcAttempt();
      await oidcStore.create(attempt);
      await oidcStore.claim(attempt.stateHash, attempt);
      const results = await Promise.allSettled([
        oidcStore.verify(attempt, proof()),
        oidcStore.cancel(attempt.id, attempt.browserHash),
      ]);
      expect(results[1].status).toBe('fulfilled');
      const [row] = await query('SELECT * FROM identity_portal_oidc_attempts WHERE id=?', [
        attempt.id,
      ]);
      expect(row).toMatchObject({
        status: 'invalidated',
        subject: null,
        token_issued_at: null,
        nonce: null,
        pkce_encrypted: null,
      });
      await expect(oidcStore.verify(attempt, proof())).rejects.toThrow();
      await expect(oidcStore.cancel(attempt.id, attempt.browserHash)).resolves.toEqual({
        issuedSessionHash: null,
      });
    });
    it('portal OIDC rejects expired and globally revoked contexts after reopening', async () => {
      await open();
      const attempt = oidcAttempt();
      await oidcStore.create(attempt);
      await oidcStore.claim(attempt.stateHash, attempt);
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
      await expect(oidcStore.verify(attempt, proof())).rejects.toThrow();
      const expired = oidcAttempt();
      await oidcStore.create(expired);
      await execute(
        'UPDATE identity_portal_oidc_attempts SET created_at=0,expires_at=1 WHERE id=?',
        [expired.id],
      );
      await expect(oidcStore.claim(expired.stateHash, expired)).rejects.toThrow();
      await expect(oidcStore.cancel(expired.id, expired.browserHash)).resolves.toEqual({
        issuedSessionHash: null,
      });
    });
    it('portal OIDC keeps consumed association and rolls back caller consumption on failure', async () => {
      await open();
      const attempt = oidcAttempt();
      await oidcStore.create(attempt);
      await oidcStore.claim(attempt.stateHash, attempt);
      await oidcStore.verify(attempt, proof());
      // Synthetic future consumer only: Block 2 production code never consumes.
      const consume = (db: Parameters<Parameters<typeof transaction>[0]>[0]) =>
        execute(
          "UPDATE identity_portal_oidc_attempts SET status='consumed',consumed_at=CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED),issued_session_hash=?,subject=NULL,token_issued_at=NULL,token_expires_at=NULL,authentication_time=NULL WHERE id=?",
          [portalA, attempt.id],
          db,
        );
      await expect(
        transaction(async (db) => {
          await oidcStore.readEvidenceForFinish(db, attempt);
          await consume(db);
          await execute(
            "INSERT INTO identity_audit_events(user_id,event) VALUES (?,'synthetic.failure')",
            [randomUUID()],
            db,
          );
        }),
      ).rejects.toThrow();
      expect(
        (
          await query('SELECT status FROM identity_portal_oidc_attempts WHERE id=?', [attempt.id])
        )[0].status,
      ).toBe('verified');
      await transaction(async (db) => {
        await oidcStore.readEvidenceForFinish(db, attempt);
        await consume(db);
      });
      await expect(oidcStore.cancel(attempt.id, attempt.browserHash)).resolves.toEqual({
        issuedSessionHash: portalA,
      });
      expect(
        (
          await query(
            'SELECT status,issued_session_hash FROM identity_portal_oidc_attempts WHERE id=?',
            [attempt.id],
          )
        )[0],
      ).toEqual({ status: 'consumed', issued_session_hash: portalA });
    });
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
