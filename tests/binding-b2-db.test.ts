import { disposableDatabase } from '../server/disposable-database';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import * as db from '../server/db';
import { migrate } from '../server/migrate';
import {
  operatorBindings,
  browserBindings,
  bindingContext,
  bindingMaintenance,
} from '../server/binding-operations';
import { createApp } from '../server/app';
import { createGoogleOidc } from '../server/google-oidc';
import { mysqlOidcStore } from '../server/oidc-store';
import * as identity from '../server/identity';
import * as bindingOperations from '../server/binding-operations';
import { options, simulatedGoogle } from './oidc-helper';
import { memorySessions, testCredentials } from './auth-helper';
const operator = operatorBindings(process.env.DB_NAME || '');
let ids: [string, string];
let owned = false;
const csrf = (html: string) => html.match(/name="csrf" value="([a-f0-9]{64})"/)![1];
const origin = 'http://localhost:5173';
async function direct(
  user = ids[0],
  purpose: 'initial' | 'replace' = 'initial',
  sub = 'synthetic-' + user,
) {
  const issued = await operator.issue(user, purpose),
    google = simulatedGoogle();
  const core = createGoogleOidc(options, mysqlOidcStore(), google.transport);
  const context = await bindingContext(issued.operationId, issued.code);
  const attempt = await core.begin(context);
  await core.complete(
    google.use(attempt.authorizationUrl, { claims: { sub } }),
    attempt.browserToken,
    context,
  );
  const reference = core.evidenceReference(attempt.attemptId, attempt.browserToken, context);
  return { issued, core, context, attempt, reference };
}
async function candidate(
  user = ids[0],
  purpose: 'initial' | 'replace' = 'initial',
  sub = 'synthetic-' + user,
) {
  const a = await direct(user, purpose, sub);
  const fingerprint = await browserBindings().submitCandidate(
    a.issued.operationId,
    user,
    a.issued.code,
    a.reference,
  );
  return { ...a, fingerprint };
}
async function linked() {
  for (const id of ids) {
    const a = await candidate(id);
    await operator.approve(a.issued.operationId, id, a.fingerprint);
  }
}
async function appFlow() {
  const google = simulatedGoogle();
  const agent = request.agent(
    createApp(
      { store: memorySessions() },
      {},
      {},
      {
        google: options,
        csrfKey: 'cd'.repeat(32),
        database: disposableDatabase(),
        transport: google.transport,
      },
    ),
  );
  const issued = await operator.issue(ids[0], 'initial');
  const page = await agent.get('/vincular-google').expect(200);
  const start = await agent
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .type('form')
    .send({ operationId: issued.operationId, code: issued.code, csrf: csrf(page.text) })
    .expect(303);
  const callback = new URL(
    google.use(start.headers.location, { claims: { sub: 'synthetic-' + ids[0] } }),
  );
  return { agent, google, issued, callback, start };
}
afterAll(() => db.pool.end());
afterEach(async () => {
  vi.restoreAllMocks();
  if (!owned) return;
  const [state] = await db.query('SELECT admin_one,admin_two FROM identity_institution WHERE id=1');
  expect([state.admin_one, state.admin_two]).toEqual(ids);
  await db.execute(
    'UPDATE identity_institution SET initialized=FALSE,admin_one=NULL,admin_two=NULL WHERE id=1 AND admin_one=? AND admin_two=?',
    ids,
  );
  for (const id of ids)
    await db.execute('DELETE FROM identity_oidc_attempts WHERE user_id=?', [id]);
  for (const id of ids)
    await db.execute('DELETE FROM identity_binding_operations WHERE user_id=?', [id]);
  for (const id of ids)
    await db.execute('DELETE FROM identity_audit_events WHERE user_id=? OR actor_id=?', [id, id]);
  for (const id of ids) {
    for (const table of ['identity_sessions', 'identity_external_accounts', 'identity_user_roles'])
      await db.execute('DELETE FROM ' + table + ' WHERE user_id=?', [id]);
    await db.execute('DELETE FROM identity_users WHERE id=?', [id]);
  }
  owned = false;
});
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')(
  'Supervised binding B2 synthetic prisma_test, isolated',
  () => {
    beforeAll(async () => {
      expect(process.env.DB_NAME).toBe(disposableDatabase());
      expect(['127.0.0.1', 'localhost', '::1']).toContain(process.env.DB_HOST || '127.0.0.1');
      expect((await db.query('SELECT DATABASE() name'))[0].name).toBe(disposableDatabase());
      await migrate('019.sql');
      const [s] = await db.query('SELECT * FROM identity_institution WHERE id=1');
      if (s.initialized || s.admin_one || s.admin_two)
        throw Error('Refusing to reset existing institution');
    });
    beforeEach(async () => {
      ids = [randomUUID(), randomUUID()];
      await operator.prepare(ids);
      owned = true;
    });
    it('preflights destination, prepares only two disabled identities and closes bootstrap persistently after two approvals', async () => {
      await expect(
        operatorBindings('different_database').prepare([randomUUID(), randomUUID()]),
      ).rejects.toThrow();
      for (const id of ids) {
        const user = await identity.getIdentity(id);
        expect(user?.status).toBe('disabled');
        expect(user?.roles).toEqual([]);
      }
      const first = await candidate();
      await expect(identity.createIdentitySession(ids[0], 'crm', 1000)).rejects.toThrow();
      await operator.approve(first.issued.operationId, ids[0], first.fingerprint);
      // A new operator instance completes the second identity after interruption/restart.
      const second = await candidate(ids[1]);
      const restarted = operatorBindings(disposableDatabase());
      await restarted.approve(second.issued.operationId, ids[1], second.fingerprint);
      expect(
        (await restarted.status()).every((row) => row.initialized === 1 && row.google_bound === 1),
      ).toBe(true);
      await expect(restarted.prepare([randomUUID(), randomUUID()])).rejects.toThrow();
      await expect(restarted.issue(ids[0], 'initial')).rejects.toThrow();
      await expect(
        restarted.approve(first.issued.operationId, ids[0], first.fingerprint),
      ).rejects.toThrow();
    });
    it('consumes evidence with candidate/audit in one transaction and rolls everything back on audit failure', async () => {
      const a = await direct();
      const original = db.execute;
      vi.spyOn(db, 'execute').mockImplementation(async (sql, values, connection) => {
        if (
          sql.includes('INSERT INTO identity_audit_events') &&
          values?.includes('binding.candidate')
        )
          throw Error('Synthetic audit failure');
        return original(sql, values, connection);
      });
      await expect(
        browserBindings().submitCandidate(a.issued.operationId, ids[0], a.issued.code, a.reference),
      ).rejects.toThrow();
      vi.restoreAllMocks();
      expect(
        (
          await db.query('SELECT status FROM identity_oidc_attempts WHERE id=?', [
            a.attempt.attemptId,
          ])
        )[0].status,
      ).toBe('verified');
      expect(
        (
          await db.query('SELECT subject FROM identity_binding_operations WHERE id=?', [
            a.issued.operationId,
          ])
        )[0].subject,
      ).toBeNull();
      await browserBindings().submitCandidate(
        a.issued.operationId,
        ids[0],
        a.issued.code,
        a.reference,
      );
      expect(
        (
          await db.query('SELECT status FROM identity_oidc_attempts WHERE id=?', [
            a.attempt.attemptId,
          ])
        )[0].status,
      ).toBe('consumed');
    });
    it('rejects code errors, crossed UUID/context, revoked/expired/used operations and arbitrary proof', async () => {
      const a = await direct(),
        service = browserBindings();
      await expect(
        service.submitCandidate(a.issued.operationId, ids[0], '0'.repeat(64), a.reference),
      ).rejects.toThrow();
      await expect(
        service.submitCandidate(a.issued.operationId, ids[1], a.issued.code, a.reference),
      ).rejects.toThrow();
      await expect(
        service.submitCandidate(a.issued.operationId, ids[0], a.issued.code, { subject: 'forged' }),
      ).rejects.toThrow();
      await operator.revoke(a.issued.operationId, ids[0]);
      await expect(
        service.submitCandidate(a.issued.operationId, ids[0], a.issued.code, a.reference),
      ).rejects.toThrow();
      const b = await direct();
      await db.execute(
        'UPDATE identity_binding_operations SET expires_at=created_at+1 WHERE id=?',
        [b.issued.operationId],
      );
      await expect(
        service.submitCandidate(b.issued.operationId, ids[0], b.issued.code, b.reference),
      ).rejects.toThrow();
      const c = await candidate();
      await operator.approve(c.issued.operationId, ids[0], c.fingerprint);
      await expect(
        service.submitCandidate(c.issued.operationId, ids[0], c.issued.code, c.reference),
      ).rejects.toThrow();
    });
    it('rejects an authentic live proof for a different valid target operation or purpose without consuming it', async () => {
      const a = await direct(ids[0]);
      const b = await direct(ids[1]);
      await expect(
        browserBindings().submitCandidate(a.issued.operationId, ids[0], a.issued.code, b.reference),
      ).rejects.toThrow();
      expect(
        (
          await db.query('SELECT status FROM identity_oidc_attempts WHERE id=?', [
            b.attempt.attemptId,
          ])
        )[0].status,
      ).toBe('verified');
      expect(
        (
          await db.query('SELECT subject FROM identity_binding_operations WHERE id=?', [
            a.issued.operationId,
          ])
        )[0].subject,
      ).toBeNull();
      const google = simulatedGoogle();
      const core = createGoogleOidc(options, mysqlOidcStore(), google.transport);
      const login = await core.begin({ purpose: 'login' });
      try {
        await core.complete(google.use(login.authorizationUrl), login.browserToken, {
          purpose: 'login',
        });
        await expect(
          browserBindings().submitCandidate(
            a.issued.operationId,
            ids[0],
            a.issued.code,
            core.evidenceReference(login.attemptId, login.browserToken, { purpose: 'login' }),
          ),
        ).rejects.toThrow();
        expect(
          (
            await db.query('SELECT status FROM identity_oidc_attempts WHERE id=?', [
              login.attemptId,
            ])
          )[0].status,
        ).toBe('verified');
      } finally {
        await db.execute('DELETE FROM identity_oidc_attempts WHERE id=?', [login.attemptId]);
      }
    });
    it('rechecks sub uniqueness at approval when two candidates predate the first binding', async () => {
      const a = await candidate(ids[0], 'initial', 'synthetic-shared-google');
      const b = await candidate(ids[1], 'initial', 'synthetic-shared-google');
      await operator.approve(a.issued.operationId, ids[0], a.fingerprint);
      await expect(operator.approve(b.issued.operationId, ids[1], b.fingerprint)).rejects.toThrow(
        'ya vinculada',
      );
      expect((await identity.getIdentity(ids[1]))?.status).toBe('disabled');
      expect(
        (
          await db.query('SELECT consumed_at FROM identity_binding_operations WHERE id=?', [
            b.issued.operationId,
          ])
        )[0].consumed_at,
      ).toBeNull();
    });
    it('serializes simultaneous submissions and approvals, rejects a changed inspected candidate', async () => {
      const a = await direct();
      const submit = () =>
        browserBindings().submitCandidate(a.issued.operationId, ids[0], a.issued.code, a.reference);
      const submitted = await Promise.allSettled([submit(), submit()]);
      expect(submitted.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const inspected = await operator.inspect(a.issued.operationId, ids[0]);
      await db.execute('UPDATE identity_binding_operations SET subject=? WHERE id=?', [
        'synthetic-changed',
        a.issued.operationId,
      ]);
      await expect(
        operator.approve(a.issued.operationId, ids[0], inspected.fingerprint),
      ).rejects.toThrow('cambió');
      const current = await operator.inspect(a.issued.operationId, ids[0]);
      const approved = await Promise.allSettled([
        operator.approve(a.issued.operationId, ids[0], current.fingerprint),
        operator.approve(a.issued.operationId, ids[0], current.fingerprint),
      ]);
      expect(approved.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
    it('keeps an unrecognized Google account pending for operator rejection; no browser privilege or self-enrollment', async () => {
      const a = await candidate(ids[0], 'initial', 'synthetic-foreign-account');
      expect((await identity.getIdentity(ids[0]))?.status).toBe('disabled');
      await expect(
        operator.approve(a.issued.operationId, ids[0], 'a'.repeat(64)),
      ).rejects.toThrow();
      await operator.revoke(a.issued.operationId, ids[0]);
      await expect(operator.approve(a.issued.operationId, ids[0], a.fingerprint)).rejects.toThrow();
      await expect(browserBindings().configure({}, ids)).rejects.toThrow();
      await expect(browserBindings().issue({}, ids[0], 'initial')).rejects.toThrow();
    });
    it('replaces a Google account preserving UUID, revokes sessions, keeps last administrator protected', async () => {
      await linked();
      const session = await identity.createIdentitySession(ids[0], 'crm', 60000);
      const a = await candidate(ids[0], 'replace', 'synthetic-new-google');
      await operator.approve(a.issued.operationId, ids[0], a.fingerprint);
      expect((await identity.findExternalIdentity('google', 'synthetic-new-google'))?.id).toBe(
        ids[0],
      );
      expect(await identity.authenticateIdentitySession(session.token, 'crm')).toBeUndefined();
      await identity.setIdentityStatus(ids[0], 'disabled', null);
      await expect(identity.setIdentityStatus(ids[1], 'disabled', null)).rejects.toThrow(
        'conservarse',
      );
    });
    it('validates the final database expiry after evidence consumption and rolls back that consumption', async () => {
      const a = await direct(),
        store = mysqlOidcStore();
      const service = (await import('../server/identity-bindings')).createBindingService({
        authorize: async () => {
          throw Error();
        },
        verifyCandidate: async (ref, _context, connection) => {
          const proof = await store.consumeEvidence(connection, ref as typeof a.reference);
          await db.execute(
            'UPDATE identity_binding_operations SET expires_at=created_at+1 WHERE id=?',
            [a.issued.operationId],
            connection,
          );
          return { provider: 'google', subject: proof.subject };
        },
      });
      await expect(
        service.submitCandidate(a.issued.operationId, ids[0], a.issued.code, a.reference),
      ).rejects.toThrow();
      expect(
        (
          await db.query('SELECT status FROM identity_oidc_attempts WHERE id=?', [
            a.attempt.attemptId,
          ])
        )[0].status,
      ).toBe('verified');
    });
    it('has one durable active binding attempt per temporary browser correlation', async () => {
      const issued = await operator.issue(ids[0], 'initial'),
        google = simulatedGoogle(),
        core = createGoogleOidc(options, mysqlOidcStore(), google.transport);
      const context = await bindingContext(issued.operationId, issued.code),
        token = (await import('../server/oidc-crypto')).opaque();
      const [a, b] = await Promise.all([core.begin(context, token), core.begin(context, token)]);
      const rows = await db.query('SELECT status FROM identity_oidc_attempts WHERE id IN (?,?)', [
        a.attemptId,
        b.attemptId,
      ]);
      expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
      expect(rows.filter((r) => r.status === 'invalidated')).toHaveLength(1);
    });
    it('completes signed Google HTTP callback, confirmation and supervised approval without administrative login', async () => {
      const { agent, issued, callback } = await appFlow();
      await agent
        .get(callback.pathname + callback.search)
        .set('Sec-Fetch-Site', 'cross-site')
        .expect(303);
      const confirm = await agent.get('/vincular-google').expect(200);
      expect(confirm.text).toContain('Volvé a ingresar');
      const pending = await agent
        .post('/api/auth/google/binding/submit')
        .set('Origin', origin)
        .type('form')
        .send({ code: issued.code, csrf: csrf(confirm.text) })
        .expect(200);
      expect(pending.text).toContain('pendiente de aprobación');
      expect(pending.text).not.toContain(issued.code);
      const inspected = await operator.inspect(issued.operationId, ids[0]);
      expect(pending.text).toContain(inspected.fingerprint);
      expect((await agent.get('/api/auth/session')).body.authenticated).toBe(false);
      await operator.approve(issued.operationId, ids[0], inspected.fingerprint);
      expect((await agent.get('/api/auth/session')).body.authenticated).toBe(false);
      expect([401, 503]).toContain((await agent.get('/api/people')).status); // no institutional access, regardless of legacy configuration
      await agent.get(callback.pathname + callback.search).expect(400);
    });
    it('rejects CSRF, missing/wrong Origin, cross-site POST, compressed input, other browser, privileged endpoints', async () => {
      const { agent, issued, callback } = await appFlow();
      const other = request.agent(
        createApp(
          {},
          {},
          {},
          { google: options, csrfKey: 'cd'.repeat(32), database: disposableDatabase() },
        ),
      );
      await other.get(callback.pathname + callback.search).expect(400);
      const page = await agent.get('/vincular-google');
      const input = { operationId: issued.operationId, code: issued.code, csrf: csrf(page.text) };
      await agent.post('/api/auth/google/binding/start').type('form').send(input).expect(403);
      await agent
        .post('/api/auth/google/binding/start')
        .set('Origin', 'https://other.invalid')
        .type('form')
        .send(input)
        .expect(403);
      await agent
        .post('/api/auth/google/binding/start')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'cross-site')
        .type('form')
        .send(input)
        .expect(403);
      await agent
        .post('/api/auth/google/binding/start')
        .set('Origin', origin)
        .type('form')
        .send({ ...input, csrf: 'a'.repeat(64) })
        .expect(403);
      await agent
        .post('/api/auth/google/binding/start')
        .set('Content-Encoding', 'gzip')
        .type('form')
        .send(input)
        .expect(400);
      for (const path of ['approve', 'configure', 'recover'])
        await agent
          .post('/api/auth/google/' + path)
          .send({ kind: 'operator' })
          .expect(404);
      await agent
        .post('/api/auth/google/binding/cancel')
        .set('Origin', origin)
        .type('form')
        .send({ csrf: csrf(page.text) })
        .expect(303);
      await agent.get(callback.pathname + callback.search).expect(400);
    });
    it('enforces per-operation limits and cookies without disclosing identity', async () => {
      const { agent, issued, start } = await appFlow();
      expect(String(start.headers['set-cookie'])).toContain('HttpOnly');
      expect(String(start.headers['set-cookie'])).toContain('SameSite=Lax');
      expect(start.headers['cache-control']).toBe('no-store');
      expect(start.headers['referrer-policy']).toBe('same-origin');
      for (let i = 0; i < 4; i++) {
        const page = await agent.get('/vincular-google');
        await agent
          .post('/api/auth/google/binding/start')
          .set('Origin', origin)
          .type('form')
          .send({ operationId: issued.operationId, code: '0'.repeat(64), csrf: csrf(page.text) })
          .expect(400);
      }
      const page = await agent.get('/vincular-google');
      await agent
        .post('/api/auth/google/binding/start')
        .set('Origin', origin)
        .type('form')
        .send({ operationId: issued.operationId, code: issued.code, csrf: csrf(page.text) })
        .expect(429);
    });
    it('uses the socket peer for IP limits; forged forwarded headers cannot reset the counter', async () => {
      const agent = request.agent(
        createApp(
          {},
          {},
          {},
          { google: options, csrfKey: 'cd'.repeat(32), database: disposableDatabase() },
        ),
      );
      for (let i = 0; i < 11; i++) {
        const page = await agent.get('/vincular-google');
        await agent
          .post('/api/auth/google/binding/start')
          .set('Origin', origin)
          .set('X-Forwarded-For', `192.0.2.${i + 1}`)
          .type('form')
          .send({ operationId: randomUUID(), code: 'a'.repeat(64), csrf: csrf(page.text) })
          .expect(i < 10 ? 400 : 429);
      }
    });
    it('limits concurrent remote exchanges to two without holding database row locks', async () => {
      const providers = new Map<string, ReturnType<typeof simulatedGoogle>>();
      let entered = 0;
      let signal!: () => void;
      let release!: () => void;
      const bothEntered = new Promise<void>((resolve) => {
        signal = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fallback = simulatedGoogle();
      const app = createApp(
        {},
        {},
        {},
        {
          google: options,
          csrfKey: 'cd'.repeat(32),
          database: disposableDatabase(),
          transport: async (url, init) => {
            if (url.toString().includes('/token')) {
              const provider = providers.get(
                new URLSearchParams(init.body as string).get('code')!,
              )!;
              entered++;
              if (entered === 2) signal();
              await gate;
              return provider.transport(url, init);
            }
            return fallback.transport(url, init);
          },
        },
      );
      const issued = await operator.issue(ids[0], 'initial');
      const flows = [];
      for (let i = 0; i < 3; i++) {
        const agent = request.agent(app),
          page = await agent.get('/vincular-google');
        const start = await agent
          .post('/api/auth/google/binding/start')
          .set('Origin', origin)
          .type('form')
          .send({ operationId: issued.operationId, code: issued.code, csrf: csrf(page.text) })
          .expect(303);
        const provider = simulatedGoogle(),
          callback = new URL(provider.use(start.headers.location));
        callback.searchParams.set('code', 'synthetic-' + i);
        providers.set('synthetic-' + i, provider);
        flows.push({ agent, path: callback.pathname + callback.search });
      }
      let releaseLookups!: () => void;
      let signalLookups!: () => void;
      let lookups = 0;
      const lookupGate = new Promise<void>((resolve) => {
        releaseLookups = resolve;
      });
      const bothLookingUp = new Promise<void>((resolve) => {
        signalLookups = resolve;
      });
      const originalLookup = bindingOperations.bindingAttempt;
      vi.spyOn(bindingOperations, 'bindingAttempt').mockImplementation(async (...args) => {
        lookups++;
        if (lookups === 2) signalLookups();
        await lookupGate;
        return originalLookup(...args);
      });
      const first = flows[0].agent.get(flows[0].path).then((res) => res.status);
      const second = flows[1].agent.get(flows[1].path).then((res) => res.status);
      try {
        await bothLookingUp;
        // Neither lookup nor token exchange has completed. A third callback must
        // already be rejected instead of passing the cap before its own await.
        await flows[2].agent.get(flows[2].path).timeout({ deadline: 1500 }).expect(429);
        expect(lookups).toBe(2);
        releaseLookups();
        await bothEntered;
        // A context row remains lockable during network wait.
        await db.transaction(async (connection) => {
          await db.query(
            'SELECT id FROM identity_binding_operations WHERE id=? FOR UPDATE',
            [issued.operationId],
            connection,
          );
        });
      } finally {
        releaseLookups();
        release();
      }
      expect(await Promise.all([first, second])).toEqual([303, 303]);
      expect(entered).toBe(2);
    });
    it('sets production Host-prefixed Secure cookies without relying on forwarded protocol', async () => {
      const previous = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const app = createApp(
          {},
          {},
          {},
          {
            google: { ...options, redirectUri: 'https://example.invalid/api/auth/google/callback' },
            csrfKey: 'cd'.repeat(32),
            database: disposableDatabase(),
          },
        );
        const response = await request(app).get('/vincular-google').expect(200);
        const cookies = String(response.headers['set-cookie']);
        expect(cookies).toContain('__Host-prisma_binding_csrf=');
        expect(cookies).toContain('Secure');
        expect(cookies).toContain('HttpOnly');
        expect(cookies).not.toContain('Domain=');
      } finally {
        if (previous === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previous;
      }
    });
    it('maintenance preserves all institutional operations and audit and legacy auth stays available when B2 schema/config fails', async () => {
      const a = await candidate();
      const before = await db.query('SELECT * FROM identity_audit_events WHERE user_id=?', [
        ids[0],
      ]);
      await db.execute(
        'UPDATE identity_binding_operations SET expires_at=created_at+1 WHERE id=?',
        [a.issued.operationId],
      );
      await Promise.all([bindingMaintenance(), bindingMaintenance()]);
      expect(
        await db.query('SELECT * FROM identity_binding_operations WHERE id=?', [
          a.issued.operationId,
        ]),
      ).toHaveLength(1);
      const after = await db.query('SELECT * FROM identity_audit_events WHERE user_id=?', [ids[0]]);
      expect(after.slice(0, before.length)).toEqual(before);
      expect(after.filter((event) => event.event === 'binding.expired')).toHaveLength(1);
      const credentials = await testCredentials();
      const app = createApp(
        { ...credentials, store: memorySessions() },
        {},
        {},
        { google: options, csrfKey: 'cd'.repeat(32), database: 'wrong_database' },
      );
      await request(app).get('/vincular-google').expect(503);
      await request(app)
        .post('/api/auth/login')
        .send({ password: credentials.password })
        .expect(200);
    });
  },
);
