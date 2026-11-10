import { disposableDatabase } from '../server/disposable-database';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
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
    await db.execute(
      'DELETE FROM identity_oidc_attempts WHERE issued_session_hash IN (SELECT token_hash FROM identity_sessions WHERE user_id=?)',
      [id],
    );
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
      const legacy = randomUUID();
      await db.execute(
        "INSERT INTO identity_oidc_attempts(id,provider,purpose,application,configuration_hash,state_hash,browser_hash,status,created_at,expires_at,claimed_at,verified_at,consumed_at) VALUES (?,'google','login','crm',?,?,?,'consumed',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000+300000,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000,UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)",
        [
          legacy,
          ...['config', 'state', 'browser'].map((label) =>
            createHash('sha256')
              .update(label + legacy)
              .digest('hex'),
          ),
        ],
      );
      const before = (
        await db.query('SELECT * FROM identity_oidc_attempts WHERE id=?', [legacy])
      )[0];
      await migrate('020.sql');
      const after = (
        await db.query('SELECT * FROM identity_oidc_attempts WHERE id=?', [legacy])
      )[0];
      expect(after).toMatchObject(before);
      expect(after.issued_session_hash).toBeNull();
      await db.execute('DELETE FROM identity_oidc_attempts WHERE id=?', [legacy]);
      const [s] = await db.query('SELECT * FROM identity_institution WHERE id=1');
      if (s.initialized || s.admin_one || s.admin_two)
        throw Error('Refusing to reset existing institution');
    });
    beforeEach(async () => {
      ids = [randomUUID(), randomUUID()];
      await operator.prepare(ids);
      owned = true;
    });
    describe('Block 3 institutional guard and logout', () => {
      async function session() {
        await linked();
        const issued = await identity.createIdentitySession(ids[0], 'crm', 60000);
        const app = createApp(
          { hash: '', secret: '', store: memorySessions(), identityEnabled: true },
          {},
          {},
          false,
        );
        return { issued, app, cookie: 'prisma_identity=' + issued.token };
      }
      it('authorizes a bound institutional admin without legacy configuration, then revokes only the presented session', async () => {
        const f = await session();
        const other = await identity.createIdentitySession(ids[0], 'crm', 60000);
        const status = await request(f.app)
          .get('/api/auth/session')
          .set('Cookie', f.cookie)
          .expect(200);
        expect(status.body).toMatchObject({
          authenticated: true,
          configured: false,
          method: 'identity',
          identity: { userId: ids[0], roles: ['admin'] },
          expiresAt: f.issued.expiresAt,
        });
        await request(f.app).get('/api/missing').set('Cookie', f.cookie).expect(404);
        for (let i = 0; i < 2; i++)
          await request(f.app).post('/api/auth/logout').set('Cookie', f.cookie).expect(200);
        await request(f.app).get('/api/missing').set('Cookie', f.cookie).expect(401);
        expect(
          await identity.authenticateIdentitySession(other.token, 'crm', {
            requireInstitution: true,
          }),
        ).toBeDefined();
        expect(
          (
            await db.query('SELECT revoked_at FROM identity_sessions WHERE token_hash=?', [
              identity.sessionDigest(f.issued.token),
            ])
          )[0].revoked_at,
        ).not.toBeNull();
      });
      it.each([
        'expired',
        'revoked',
        'disabled',
        'role',
        'unbound',
        'application',
        'unknown',
        'malformed',
        'bootstrap',
        'outsider',
        'incomplete',
      ])('rejects %s on the next request', async (mode) => {
        const f = await session();
        const hash = identity.sessionDigest(f.issued.token);
        if (mode === 'expired')
          await db.execute(
            'UPDATE identity_sessions SET created_at=created_at-60001,expires_at=expires_at-60001 WHERE token_hash=?',
            [hash],
          );
        if (mode === 'revoked') await identity.revokePresentedIdentitySession(f.issued.token);
        if (mode === 'disabled') await identity.setIdentityStatus(ids[0], 'disabled', null);
        if (mode === 'role') await identity.setIdentityRole(ids[0], 'admin', false, null);
        // Synthetic fixture corruption tests revalidation independently of service revocation.
        if (mode === 'unbound')
          await db.execute(
            "DELETE FROM identity_external_accounts WHERE user_id=? AND provider='google'",
            [ids[0]],
          );
        if (mode === 'application')
          await db.execute("UPDATE identity_sessions SET application='pwa' WHERE token_hash=?", [
            hash,
          ]);
        if (mode === 'bootstrap')
          await db.execute('UPDATE identity_institution SET initialized=FALSE WHERE id=1');
        if (mode === 'outsider')
          await db.execute('UPDATE identity_institution SET admin_one=NULL WHERE id=1');
        if (mode === 'incomplete')
          await db.execute('UPDATE identity_institution SET admin_two=NULL WHERE id=1');
        try {
          const cookie =
            mode === 'unknown'
              ? 'prisma_identity=' + 'f'.repeat(64)
              : mode === 'malformed'
                ? 'prisma_identity=bad'
                : f.cookie;
          await request(f.app).get('/api/missing').set('Cookie', cookie).expect(401);
        } finally {
          if (mode === 'outsider')
            await db.execute('UPDATE identity_institution SET admin_one=? WHERE id=1', [ids[0]]);
          if (mode === 'incomplete')
            await db.execute('UPDATE identity_institution SET admin_two=? WHERE id=1', [ids[1]]);
        }
      });
      it('replacement revokes old sessions and concurrent authorization/revocation cannot resurrect them', async () => {
        const f = await session();
        const replacement = await candidate(ids[0], 'replace', 'synthetic-replaced');
        await Promise.all([
          identity.authenticateIdentitySession(f.issued.token, 'crm', { requireInstitution: true }),
          operator.approve(replacement.issued.operationId, ids[0], replacement.fingerprint),
        ]);
        expect(
          await identity.authenticateIdentitySession(f.issued.token, 'crm', {
            requireInstitution: true,
          }),
        ).toBeUndefined();
        await request(f.app).get('/api/missing').set('Cookie', f.cookie).expect(401);
      });
      it('logout serializes with access and the final state is revoked', async () => {
        const f = await session();
        const responses = await Promise.all([
          request(f.app).get('/api/missing').set('Cookie', f.cookie),
          request(f.app).post('/api/auth/logout').set('Cookie', f.cookie),
        ]);
        expect([401, 404]).toContain(responses[0].status);
        expect(responses[1].status).toBe(200);
        await request(f.app).get('/api/missing').set('Cookie', f.cookie).expect(401);
      });
      it('duplicate individual cookies are ambiguous, coexistence with legacy conflicts, logout revokes both', async () => {
        const f = await session();
        const second = await identity.createIdentitySession(ids[1], 'crm', 60000);
        const cookies = [f.cookie, 'prisma_identity=' + second.token];
        await request(f.app).get('/api/missing').set('Cookie', cookies).expect(401);
        await request(f.app)
          .get('/api/missing')
          .set('Cookie', [...cookies, 'prisma_admin=bad'])
          .expect(409);
        await request(f.app).post('/api/auth/logout').set('Cookie', cookies).expect(200);
        for (const token of [f.issued.token, second.token])
          expect(
            await identity.authenticateIdentitySession(token, 'crm', { requireInstitution: true }),
          ).toBeUndefined();
      });
      it('individual revocation survives a subsequent legacy failure; retry safely completes logout', async () => {
        const f = await session();
        const credentials = await testCredentials();
        const storage = memorySessions();
        let completed!: () => void;
        const revoked = new Promise<void>((resolve) => {
          completed = resolve;
        });
        const original = identity.revokePresentedIdentitySession;
        vi.spyOn(identity, 'revokePresentedIdentitySession').mockImplementation(async (token) => {
          await original(token);
          completed();
        });
        let fail = true;
        const app = createApp(
          {
            ...credentials,
            identityEnabled: true,
            store: {
              ...storage,
              async delete(key) {
                if (fail) {
                  await revoked;
                  fail = false;
                  throw Error('Synthetic legacy revocation failure');
                }
                await storage.delete(key);
              },
            },
          },
          {},
          {},
          false,
        );
        const login = await request(app)
          .post('/api/auth/login')
          .send({ password: credentials.password })
          .expect(200);
        const legacy = login.headers['set-cookie'][0].split(';')[0];
        const cookies = [f.cookie, legacy];
        const failed = await request(app)
          .post('/api/auth/logout')
          .set('Cookie', cookies)
          .expect(503);
        expect(failed.headers['set-cookie']).toBeUndefined();
        expect(
          await identity.authenticateIdentitySession(f.issued.token, 'crm', {
            requireInstitution: true,
          }),
        ).toBeUndefined();
        await request(app).get('/api/missing').set('Cookie', cookies).expect(409);
        await request(app).get('/api/missing').set('Cookie', f.cookie).expect(401);
        await request(app).get('/api/missing').set('Cookie', legacy).expect(404);
        const retried = await request(app)
          .post('/api/auth/logout')
          .set('Cookie', cookies)
          .expect(200);
        expect(String(retried.headers['set-cookie'])).toContain('prisma_identity=;');
        expect(String(retried.headers['set-cookie'])).toContain('prisma_admin=;');
        await request(app).get('/api/missing').set('Cookie', legacy).expect(401);
        await request(app).get('/api/missing').set('Cookie', f.cookie).expect(401);
      });
      it('logout invalidates pending Google evidence and revokes the session of a consumed attempt', async () => {
        await linked();
        const google = simulatedGoogle();
        const core = createGoogleOidc(options, mysqlOidcStore(), google.transport);
        const pending = await core.begin({ purpose: 'login' });
        const reference = core.evidenceReference(pending.attemptId, pending.browserToken, {
          purpose: 'login',
        });
        await identity.cancelPresentedGoogleLogin(reference);
        await identity.cancelPresentedGoogleLogin(reference);
        await expect(
          core.complete(google.use(pending.authorizationUrl), pending.browserToken, {
            purpose: 'login',
          }),
        ).rejects.toThrow();
        const issued = await core.begin({ purpose: 'login' });
        await core.complete(
          google.use(issued.authorizationUrl, { claims: { sub: 'synthetic-' + ids[0] } }),
          issued.browserToken,
          { purpose: 'login' },
        );
        const consumed = core.evidenceReference(issued.attemptId, issued.browserToken, {
          purpose: 'login',
        });
        const issuedSession = await identity.completeGoogleLogin(consumed);
        await identity.cancelPresentedGoogleLogin(consumed);
        await identity.cancelPresentedGoogleLogin(consumed);
        expect(
          await identity.authenticateIdentitySession(issuedSession.token, 'crm'),
        ).toBeUndefined();
      });
    });
    describe('B3 HTTP login', () => {
      async function flow(production = false, bindingEnabled = true) {
        const google = simulatedGoogle();
        const app = createApp(
          { store: memorySessions() },
          {},
          {},
          {
            google: production
              ? { ...options, redirectUri: 'https://crm.example/api/auth/google/callback' }
              : options,
            csrfKey: 'cd'.repeat(32),
            database: disposableDatabase(),
            transport: google.transport,
            loginEnabled: true,
            bindingEnabled,
          },
        );
        const agent = request.agent(app);
        const session = await agent.get('/api/auth/session').expect(200);
        return { google, agent, app, csrf: session.body.googleLogin.csrf, session };
      }
      async function start(f: Awaited<ReturnType<typeof flow>>) {
        const response = await f.agent
          .post('/api/auth/google/login/start')
          .set('Origin', origin)
          .type('form')
          .send({ csrf: f.csrf })
          .expect(303);
        return new URL(
          f.google.use(response.headers.location, { claims: { sub: 'synthetic-' + ids[0] } }),
        );
      }
      it.each(['rotated configuration', 'duplicate correlation'])(
        'logout correlation remains effective with %s',
        async (mode) => {
          await linked();
          const values: { cookie: string; token: string }[] = [];
          let target: ReturnType<typeof createApp> | undefined;
          for (let i = 0; i < (mode === 'duplicate correlation' ? 2 : 1); i++) {
            const f = await flow();
            target = f.app;
            const started = await f.agent
              .post('/api/auth/google/login/start')
              .set('Origin', origin)
              .type('form')
              .send({ csrf: f.csrf })
              .expect(303);
            const cookie = (started.headers['set-cookie'] as unknown as string[])
              .find((value) => value.startsWith('prisma_login='))!
              .split(';')[0];
            const url = new URL(
              f.google.use(started.headers.location, { claims: { sub: 'synthetic-' + ids[0] } }),
            );
            const callback = await f.agent.get(url.pathname + url.search).expect(303);
            const identityCookie = (callback.headers['set-cookie'] as unknown as string[]).find(
              (value) => value.startsWith('prisma_identity='),
            )!;
            values.push({ cookie, token: identityCookie.split(';')[0].split('=')[1] });
          }
          const unrelated = await identity.createIdentitySession(ids[0], 'crm', 60000);
          if (mode === 'rotated configuration')
            target = createApp(
              { store: memorySessions() },
              {},
              {},
              {
                google: { ...options, clientId: 'rotated.apps.googleusercontent.com' },
                csrfKey: 'cd'.repeat(32),
                database: disposableDatabase(),
                loginEnabled: true,
              },
            );
          await request(target!)
            .post('/api/auth/logout')
            .set(
              'Cookie',
              values.map((value) => value.cookie),
            )
            .expect(200);
          for (const value of values)
            expect(await identity.authenticateIdentitySession(value.token, 'crm')).toBeUndefined();
          expect(await identity.authenticateIdentitySession(unrelated.token, 'crm')).toBeDefined();
        },
      );
      it.each(['revocation failure', 'unassociated historical attempt'])(
        'fails logout closed for %s without erasing the retry credential',
        async (mode) => {
          await linked();
          const f = await flow();
          const started = await f.agent
            .post('/api/auth/google/login/start')
            .set('Origin', origin)
            .type('form')
            .send({ csrf: f.csrf })
            .expect(303);
          const correlation = (started.headers['set-cookie'] as unknown as string[])
            .find((value) => value.startsWith('prisma_login='))!
            .split(';')[0];
          const url = new URL(
            f.google.use(started.headers.location, { claims: { sub: 'synthetic-' + ids[0] } }),
          );
          const callback = await f.agent.get(url.pathname + url.search).expect(303);
          const cookie = (callback.headers['set-cookie'] as unknown as string[])
            .find((value) => value.startsWith('prisma_identity='))!
            .split(';')[0];
          const token = cookie.split('=')[1];
          if (mode === 'unassociated historical attempt') {
            await db.execute(
              'UPDATE identity_oidc_attempts SET issued_session_hash=NULL WHERE issued_session_hash=?',
              [identity.sessionDigest(token)],
            );
          }
          const original = db.execute;
          const spy =
            mode === 'revocation failure'
              ? vi.spyOn(db, 'execute').mockImplementation((sql, args, connection) => {
                  if (sql.startsWith('UPDATE identity_sessions SET revoked_at='))
                    throw Error('Synthetic revocation outage');
                  return original(sql, args, connection);
                })
              : undefined;
          const response = await request(f.app)
            .post('/api/auth/logout')
            .set('Cookie', correlation)
            .expect(503);
          expect(response.headers['set-cookie']).toBeUndefined();
          spy?.mockRestore();
          expect(await identity.authenticateIdentitySession(token, 'crm')).toBeDefined();
          if (mode === 'revocation failure') {
            await request(f.app).post('/api/auth/logout').set('Cookie', correlation).expect(200);
            expect(await identity.authenticateIdentitySession(token, 'crm')).toBeUndefined();
          } else {
            // Even revoking a presented identity cannot reconstruct the missing
            // historical association; no inferred mapping or false success.
            await request(f.app)
              .post('/api/auth/logout')
              .set('Cookie', [cookie, correlation])
              .expect(503);
            expect(await identity.authenticateIdentitySession(token, 'crm')).toBeUndefined();
          }
        },
      );
      it('logs out with retained consumed correlation and a valid session, including repeated logout', async () => {
        await linked();
        const f = await flow();
        const started = await f.agent
          .post('/api/auth/google/login/start')
          .set('Origin', origin)
          .type('form')
          .send({ csrf: f.csrf })
          .expect(303);
        const correlation = (started.headers['set-cookie'] as unknown as string[])
          .find((value) => value.startsWith('prisma_login='))!
          .split(';')[0];
        const url = new URL(
          f.google.use(started.headers.location, { claims: { sub: 'synthetic-' + ids[0] } }),
        );
        const callback = await f.agent.get(url.pathname + url.search).expect(303);
        const cookie = (callback.headers['set-cookie'] as unknown as string[])
          .find((value) => value.startsWith('prisma_identity='))!
          .split(';')[0];
        const token = cookie.split('=')[1];
        await request(f.app).get('/api/missing').set('Cookie', cookie).expect(404);
        for (let retry = 0; retry < 2; retry++) {
          const closed = await request(f.app)
            .post('/api/auth/logout')
            .set('Cookie', [cookie, correlation])
            .expect(200);
          expect(String(closed.headers['set-cookie'])).toContain('prisma_identity=;');
          expect(String(closed.headers['set-cookie'])).toContain('prisma_login=;');
          expect(
            await identity.authenticateIdentitySession(token, 'crm', { requireInstitution: true }),
          ).toBeUndefined();
        }
        await request(f.app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
      });
      it('logout wins while the callback is waiting for Google and prevents issuance', async () => {
        await linked();
        const f = await flow();
        let entered!: () => void, release!: () => void;
        const reached = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const paused = new Promise<void>((resolve) => {
          release = resolve;
        });
        const started = await f.agent
          .post('/api/auth/google/login/start')
          .set('Origin', origin)
          .type('form')
          .send({ csrf: f.csrf })
          .expect(303);
        const url = new URL(
          f.google.use(started.headers.location, {
            claims: { sub: 'synthetic-' + ids[0] },
            beforeToken: async () => {
              entered();
              await paused;
            },
          }),
        );
        const callback = f.agent.get(url.pathname + url.search).then((response) => response);
        try {
          await reached;
          await f.agent.post('/api/auth/logout').expect(200);
        } finally {
          release();
        }
        expect((await callback).status).toBe(400);
        expect(
          await db.query('SELECT token_hash FROM identity_sessions WHERE user_id=?', [ids[0]]),
        ).toHaveLength(0);
      });
      it('logs out after issuance commits while the callback response is pending; its late cookie cannot authorize', async () => {
        await linked();
        const f = await flow();
        let entered!: () => void, release!: () => void;
        const reached = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const paused = new Promise<void>((resolve) => {
          release = resolve;
        });
        const complete = identity.completeGoogleLogin;
        vi.spyOn(identity, 'completeGoogleLogin').mockImplementation(async (reference) => {
          const issued = await complete(reference);
          entered();
          await paused;
          return issued;
        });
        const url = await start(f);
        const callback = f.agent.get(url.pathname + url.search).then((response) => response);
        try {
          await reached;
          await f.agent.post('/api/auth/logout').expect(200);
        } finally {
          release();
        }
        const response = await callback;
        expect(response.status).toBe(303);
        const cookie = (response.headers['set-cookie'] as unknown as string[]).find((value) =>
          value.startsWith('prisma_identity='),
        )!;
        const token = cookie.split(';')[0].split('=')[1];
        expect(
          await identity.authenticateIdentitySession(token, 'crm', { requireInstitution: true }),
        ).toBeUndefined();
        await f.agent.get('/api/missing').expect(401);
        await f.agent.post('/api/auth/logout').expect(200);
        expect(
          await identity.authenticateIdentitySession(token, 'crm', { requireInstitution: true }),
        ).toBeUndefined();
      });
      it('dispatches login after commit, issues only HttpOnly session cookie and rejects replay', async () => {
        await linked();
        const f = await flow(false, false);
        const callback = await start(f);
        const result = await f.agent.get(callback.pathname + callback.search).expect(303);
        expect(result.headers.location).toBe('/');
        const sessionCookie = (result.headers['set-cookie'] as unknown as string[]).find((c) =>
          c.startsWith('prisma_identity='),
        )!;
        expect(sessionCookie).toContain('HttpOnly');
        expect(sessionCookie).toContain('SameSite=Strict');
        const token = sessionCookie.split(';')[0].split('=')[1];
        expect(result.text).not.toContain(token);
        expect(await identity.authenticateIdentitySession(token, 'crm')).toMatchObject({
          id: ids[0],
        });
        await f.agent.get(callback.pathname + callback.search).expect(400);
        expect(
          await db.query('SELECT token_hash FROM identity_sessions WHERE user_id=?', [ids[0]]),
        ).toHaveLength(1);
      });
      it('rejects Origin, CSRF and browser-selected purpose without starting OIDC', async () => {
        const f = await flow();
        const path = '/api/auth/google/login/start';
        await f.agent.post(path).type('form').send({ csrf: f.csrf }).expect(403);
        await f.agent
          .post(path)
          .set('Origin', 'https://evil.invalid')
          .type('form')
          .send({ csrf: f.csrf })
          .expect(403);
        await f.agent
          .post(path)
          .set('Origin', origin)
          .type('form')
          .send({ csrf: '00'.repeat(32) })
          .expect(403);
        await f.agent
          .post(path)
          .set('Origin', origin)
          .type('form')
          .send({ csrf: f.csrf, purpose: 'binding' })
          .expect(400);
        await f.agent.get(path).expect(405);
      });
      it.each(['prisma_admin', 'prisma_identity'])(
        'blocks switching with presented %s at start and callback',
        async (name) => {
          await linked();
          const f = await flow();
          await f.agent
            .post('/api/auth/google/login/start')
            .set('Cookie', name + '=' + 'a'.repeat(64))
            .set('Origin', origin)
            .type('form')
            .send({ csrf: f.csrf })
            .expect(409);
          const callback = await start(f);
          await f.agent
            .get(callback.pathname + callback.search)
            .set('Cookie', name + '=' + 'a'.repeat(64))
            .expect(409);
          expect(
            await db.query('SELECT token_hash FROM identity_sessions WHERE user_id=?', [ids[0]]),
          ).toHaveLength(0);
        },
      );
      it('concurrent callbacks have one winner', async () => {
        await linked();
        const f = await flow();
        const callback = await start(f);
        const responses = await Promise.all([
          f.agent.get(callback.pathname + callback.search),
          f.agent.get(callback.pathname + callback.search),
        ]);
        expect(responses.filter((r) => r.status === 303)).toHaveLength(1);
        expect(responses.filter((r) => r.status === 400)).toHaveLength(1);
      });
      it('keeps binding and login attempts independent in the same browser', async () => {
        await linked();
        const f = await flow();
        const issued = await operator.issue(ids[0], 'replace');
        const page = await f.agent.get('/vincular-google');
        const binding = await f.agent
          .post('/api/auth/google/binding/start')
          .set('Origin', origin)
          .type('form')
          .send({ operationId: issued.operationId, code: issued.code, csrf: csrf(page.text) })
          .expect(303);
        const bindingCallback = new URL(
          f.google.use(binding.headers.location, { claims: { sub: 'replacement' } }),
        );
        await f.agent
          .get(bindingCallback.pathname + bindingCallback.search)
          .expect(303)
          .expect('Location', '/vincular-google');
        const loginCallback = await start(f);
        await f.agent
          .get(loginCallback.pathname + loginCallback.search)
          .expect(303)
          .expect('Location', '/');
        expect(
          (
            await db.query(
              "SELECT status FROM identity_oidc_attempts WHERE purpose='binding' AND user_id=?",
              [ids[0]],
            )
          ).some((row) => row.status === 'verified'),
        ).toBe(true);
      });
      it.each(['nonce', 'provider', 'expired', 'browser', 'state'])(
        'rejects %s before issuing a session',
        async (mode) => {
          await linked();
          const f = await flow();
          const started = await f.agent
            .post('/api/auth/google/login/start')
            .set('Origin', origin)
            .type('form')
            .send({ csrf: f.csrf })
            .expect(303);
          const callback = new URL(
            f.google.use(started.headers.location, {
              fail: mode === 'provider',
              claims: {
                sub: 'synthetic-' + ids[0],
                ...(mode === 'nonce' ? { nonce: 'wrong' } : {}),
              },
            }),
          );
          if (mode === 'expired')
            await db.execute(
              'UPDATE identity_oidc_attempts SET created_at=created_at-300001,expires_at=expires_at-300001 WHERE state_hash=?',
              [createHash('sha256').update(callback.searchParams.get('state')!).digest('hex')],
            );
          if (mode === 'state') callback.searchParams.set('state', 'a'.repeat(43));
          const caller = mode === 'browser' ? (await flow()).agent : f.agent;
          const call = caller.get(callback.pathname + callback.search);
          if (mode === 'browser')
            call.set('Cookie', 'prisma_login=' + randomUUID() + '.' + 'a'.repeat(43));
          const result = await call.expect(400);
          expect(String(result.headers['set-cookie'] || '')).not.toContain('prisma_identity=');
          expect(
            await db.query('SELECT token_hash FROM identity_sessions WHERE user_id=?', [ids[0]]),
          ).toHaveLength(0);
        },
      );
      it('uses Host-prefixed Secure cookies for login in production', async () => {
        await linked();
        const old = process.env.NODE_ENV;
        try {
          process.env.NODE_ENV = 'production';
          const google = simulatedGoogle('https://crm.example/api/auth/google/callback');
          const app = createApp(
            { store: memorySessions() },
            {},
            {},
            {
              google: { ...options, redirectUri: 'https://crm.example/api/auth/google/callback' },
              csrfKey: 'cd'.repeat(32),
              database: disposableDatabase(),
              transport: google.transport,
              loginEnabled: true,
            },
          );
          const session = await request(app).get('/api/auth/session');
          const csrfCookie = String(session.headers['set-cookie'][0]).split(';')[0];
          const started = await request(app)
            .post('/api/auth/google/login/start')
            .set('Cookie', csrfCookie)
            .set('Origin', 'https://crm.example')
            .type('form')
            .send({ csrf: session.body.googleLogin.csrf })
            .expect(303);
          const correlation = String(started.headers['set-cookie'][0]);
          expect(correlation).toContain('__Host-prisma_login=');
          expect(correlation).toContain('Secure');
          expect(correlation).toContain('SameSite=Lax');
          const callback = new URL(
            google.use(started.headers.location, { claims: { sub: 'synthetic-' + ids[0] } }),
          );
          const result = await request(app)
            .get(callback.pathname + callback.search)
            .set('Cookie', correlation.split(';')[0])
            .expect(303);
          expect(String(result.headers['set-cookie'])).toContain('__Host-prisma_identity=');
          expect(String(result.headers['set-cookie'])).toContain('Secure; SameSite=Strict');
        } finally {
          process.env.NODE_ENV = old;
        }
      });
      it('fails closed on database failure without changing legacy session response', async () => {
        const f = await flow();
        const callback = await start(f);
        const spy = vi.spyOn(db, 'query').mockRejectedValue(new Error('synthetic database outage'));
        const result = await f.agent.get(callback.pathname + callback.search).expect(400);
        expect(result.text).not.toContain('synthetic database outage');
        expect(String(result.headers['set-cookie'] || '')).not.toContain('prisma_identity=');
        spy.mockRestore();
        expect(f.session.body.authenticated).toBe(false);
        expect(typeof f.session.body.configured).toBe('boolean');
      });
    });
    describe('B3 transactional login', () => {
      async function proof(sub = 'synthetic-' + ids[0]) {
        const google = simulatedGoogle();
        const core = createGoogleOidc(options, mysqlOidcStore(), google.transport);
        const context = { purpose: 'login' as const };
        const a = await core.begin(context);
        await core.complete(
          google.use(a.authorizationUrl, { claims: { sub, email: 'same@example.invalid' } }),
          a.browserToken,
          context,
        );
        return core.evidenceReference(a.attemptId, a.browserToken, context);
      }
      async function sessions() {
        return db.query('SELECT * FROM identity_sessions WHERE user_id=?', [ids[0]]);
      }
      it('issues once across concurrent consumers, persists digest and fixed expiry', async () => {
        await linked();
        const ref = await proof();
        const results = await Promise.allSettled([
          identity.completeGoogleLogin(ref),
          identity.completeGoogleLogin(ref),
        ]);
        const wins = results.filter((r) => r.status === 'fulfilled');
        expect(wins).toHaveLength(1);
        const { token, expiresAt } = wins[0].value;
        expect(token).toMatch(/^[a-f0-9]{64}$/);
        const rows = await sessions();
        expect(rows).toHaveLength(1);
        expect(rows[0].token_hash).toBe(identity.sessionDigest(token));
        expect(
          (
            await db.query('SELECT issued_session_hash FROM identity_oidc_attempts WHERE id=?', [
              ref.id,
            ])
          )[0].issued_session_hash,
        ).toBe(identity.sessionDigest(token));
        expect(Number(rows[0].expires_at)).toBe(expiresAt);
        expect(expiresAt - Number(rows[0].created_at)).toBe(28800000);
        expect(await identity.authenticateIdentitySession(token, 'other')).toBeUndefined();
        await expect(identity.completeGoogleLogin(ref)).rejects.toThrow();
      });
      it('rejects unbound subject with identical email, wrong purpose and expired evidence', async () => {
        await linked();
        const ref = await proof();
        await expect(identity.completeGoogleLogin(await proof('unknown'))).rejects.toThrow();
        const binding = await direct(ids[0], 'replace', 'replacement');
        await expect(identity.completeGoogleLogin(binding.reference)).rejects.toThrow();
        await db.execute(
          'UPDATE identity_oidc_attempts SET created_at=created_at-300001,expires_at=expires_at-300001 WHERE id=?',
          [ref.id],
        );
        await expect(identity.completeGoogleLogin(ref)).rejects.toThrow();
        expect(await sessions()).toHaveLength(0);
      });
      it.each(['identity_sessions', 'identity_audit_events'])(
        'rolls back failed insert into %s',
        async (table) => {
          await linked();
          const ref = await proof();
          const original = db.execute;
          const spy = vi.spyOn(db, 'execute').mockImplementation((sql, args, c) => {
            if (sql.includes('INSERT INTO ' + table)) throw Error('synthetic failure');
            return original(sql, args, c);
          });
          await expect(identity.completeGoogleLogin(ref)).rejects.toThrow();
          spy.mockRestore();
          expect(await sessions()).toHaveLength(0);
          expect(
            (await db.query('SELECT status FROM identity_oidc_attempts WHERE id=?', [ref.id]))[0]
              .status,
          ).toBe('verified');
          await identity.completeGoogleLogin(ref);
        },
      );
      it.each(['throw', 'zero'])(
        'rolls back evidence, session and audit if association fails: %s',
        async (mode) => {
          await linked();
          const ref = await proof();
          const before = await db.query(
            "SELECT id FROM identity_audit_events WHERE user_id=? AND event='session.created'",
            [ids[0]],
          );
          const original = db.execute;
          const spy = vi.spyOn(db, 'execute').mockImplementation((sql, args, connection) => {
            if (sql.includes('SET issued_session_hash=')) {
              if (mode === 'throw') throw Error('Synthetic association write failure');
              return Promise.resolve({ affectedRows: 0 } as Awaited<ReturnType<typeof db.execute>>);
            }
            return original(sql, args, connection);
          });
          await expect(identity.completeGoogleLogin(ref)).rejects.toThrow();
          spy.mockRestore();
          expect(await sessions()).toHaveLength(0);
          expect(
            (
              await db.query(
                'SELECT status,issued_session_hash FROM identity_oidc_attempts WHERE id=?',
                [ref.id],
              )
            )[0],
          ).toMatchObject({ status: 'verified', issued_session_hash: null });
          expect(
            await db.query(
              "SELECT id FROM identity_audit_events WHERE user_id=? AND event='session.created'",
              [ids[0]],
            ),
          ).toEqual(before);
          await identity.completeGoogleLogin(ref);
        },
      );
      it('enforces unique/FK association, specific revocation and migration replay/partial protection', async () => {
        await linked();
        const a = await proof(),
          b = await proof();
        const first = await identity.completeGoogleLogin(a),
          second = await identity.completeGoogleLogin(b);
        const firstHash = identity.sessionDigest(first.token);
        await expect(
          db.execute('UPDATE identity_oidc_attempts SET issued_session_hash=? WHERE id=?', [
            firstHash,
            b.id,
          ]),
        ).rejects.toThrow();
        await expect(
          db.execute('UPDATE identity_oidc_attempts SET issued_session_hash=? WHERE id=?', [
            'e'.repeat(64),
            b.id,
          ]),
        ).rejects.toThrow();
        await expect(
          db.execute('DELETE FROM identity_sessions WHERE token_hash=?', [firstHash]),
        ).rejects.toThrow();
        await identity.cancelPresentedGoogleLogin(a);
        expect(await identity.authenticateIdentitySession(first.token, 'crm')).toBeUndefined();
        expect(await identity.authenticateIdentitySession(second.token, 'crm')).toBeDefined();
        const before = await db.query(
          'SELECT issued_session_hash FROM identity_oidc_attempts WHERE id=?',
          [a.id],
        );
        await migrate('020.sql');
        expect(
          await db.query('SELECT issued_session_hash FROM identity_oidc_attempts WHERE id=?', [
            a.id,
          ]),
        ).toEqual(before);
        await db.execute("DELETE FROM schema_migrations WHERE name='020.sql'");
        try {
          await expect(migrate('020.sql')).rejects.toThrow('parcial');
        } finally {
          await db.execute("INSERT INTO schema_migrations(name) VALUES ('020.sql')");
        }
      });
      it.each(['revoked', 'expired'])(
        'retains a live session association beyond attempt retention, then cleans when %s',
        async (mode) => {
          await linked();
          const ref = await proof();
          const session = await identity.completeGoogleLogin(ref);
          await db.execute(
            'UPDATE identity_oidc_attempts SET created_at=created_at-90000000,expires_at=expires_at-90000000 WHERE id=?',
            [ref.id],
          );
          await mysqlOidcStore().cleanup();
          expect(
            await db.query('SELECT id FROM identity_oidc_attempts WHERE id=?', [ref.id]),
          ).toHaveLength(1);
          if (mode === 'revoked') await identity.cancelPresentedGoogleLogin(ref);
          else
            await db.execute(
              'UPDATE identity_sessions SET created_at=created_at-28800001,expires_at=expires_at-28800001 WHERE token_hash=?',
              [identity.sessionDigest(session.token)],
            );
          await mysqlOidcStore().cleanup();
          expect(
            await db.query('SELECT id FROM identity_oidc_attempts WHERE id=?', [ref.id]),
          ).toHaveLength(0);
          await identity.cancelPresentedGoogleLogin(ref);
          expect(await identity.authenticateIdentitySession(session.token, 'crm')).toBeUndefined();
        },
      );
      it('does not infer or silently purge an old unassociated consumed attempt while a CRM session is live', async () => {
        await linked();
        const ref = await proof();
        const session = await identity.completeGoogleLogin(ref);
        await db.execute(
          'UPDATE identity_oidc_attempts SET issued_session_hash=NULL,created_at=created_at-90000000,expires_at=expires_at-90000000 WHERE id=?',
          [ref.id],
        );
        await expect(identity.cancelPresentedGoogleLogin(ref)).rejects.toThrow('sin asociación');
        await mysqlOidcStore().cleanup();
        expect(
          await db.query('SELECT id FROM identity_oidc_attempts WHERE id=?', [ref.id]),
        ).toHaveLength(1);
        expect(await identity.authenticateIdentitySession(session.token, 'crm')).toBeDefined();
        await identity.revokePresentedIdentitySession(session.token);
        await mysqlOidcStore().cleanup();
        expect(
          await db.query('SELECT id FROM identity_oidc_attempts WHERE id=?', [ref.id]),
        ).toHaveLength(0);
      });
      it.each(['suspend', 'role', 'replace'])('serializes login with %s', async (action) => {
        await linked();
        const ref = await proof();
        const change =
          action === 'replace' ? await candidate(ids[0], 'replace', 'replacement') : undefined;
        const [login] = await Promise.all([
          Promise.allSettled([identity.completeGoogleLogin(ref)]),
          change
            ? operator.approve(change.issued.operationId, ids[0], change.fingerprint)
            : action === 'role'
              ? identity.setIdentityRole(ids[0], 'admin', false, null)
              : identity.setIdentityStatus(ids[0], 'disabled', null),
        ]);
        if (login[0].status === 'fulfilled')
          expect(
            await identity.authenticateIdentitySession(login[0].value.token, 'crm'),
          ).toBeUndefined();
        await expect(identity.completeGoogleLogin(await proof())).rejects.toThrow();
      });
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
