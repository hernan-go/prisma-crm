import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { createPortalHttp, type PortalHttpOptions } from '../server/portal-http.js';
import { memoryOidcStore, options, simulatedGoogle } from './oidc-helper.js';
import type { PortalOidcContext } from '../server/portal-oidc-contracts.js';
import { digest, opaque } from '../server/oidc-crypto.js';
import { AppError } from '../server/errors.js';

const origin = 'http://localhost:5173';
const redirectUri = origin + '/api/portal/auth/google/callback';
const cookies = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)?.map((v) => v.split(';')[0]) ?? [];
function setup() {
  const memory = memoryOidcStore<PortalOidcContext>();
  const google = simulatedGoogle(redirectUri);
  const sessions = {
    available: vi.fn(async () => {}),
    logout: vi.fn(
      async (_credentials: {
        portalTokens: string[];
        correlation?: { id: string; browserHash: string };
      }) => {},
    ),
    expectedCrm: vi.fn(async () => null as string | null),
    finish: vi.fn(async () => ({
      token: 'a'.repeat(64),
      expiresAt: Date.now() + 28800000,
      userId: 'private-user',
      instructorId: 1,
    })),
    authenticate: vi.fn(async () => ({
      userId: 'private-user',
      instructorId: 1,
      expiresAt: Date.now() + 28800000,
    })),
  };
  const store = {
    ...memory.store,
    contextForCallback: async (id: string, hash: string) => {
      const row = memory.rows.get(id);
      if (!row || row.browserHash !== hash) throw Error('Invalid correlation');
      return row.context;
    },
  };
  const config: PortalHttpOptions = {
    google: { ...options, redirectUri },
    csrfKey: 'cd'.repeat(32),
    sessions,
    store,
    transport: google.transport,
  };
  const app = express();
  const portal = createPortalHttp(config);
  app.use('/api/portal', portal.api);
  app.use('/app', portal.app);
  return { app, sessions, google, ...memory, config };
}
async function start(f: ReturnType<typeof setup>) {
  const bootstrap = await request(f.app).get('/api/portal/auth/session');
  expect(bootstrap.status).toBe(200);
  const initial = cookies(bootstrap);
  const response = await request(f.app)
    .post('/api/portal/auth/google/start')
    .set('Origin', origin)
    .set('Cookie', initial)
    .set('X-Portal-CSRF', bootstrap.body.csrf);
  expect(response.status).toBe(200);
  return { response, initial, jar: [...initial, ...cookies(response)] };
}
afterEach(() => vi.restoreAllMocks());

it.each(['absent', 'invalid'])(
  'keeps recovery available with %s OAuth while authentication stays closed',
  async (kind) => {
    const f = setup();
    const portal = createPortalHttp(
      kind === 'absent' ? undefined : { ...f.config, google: { ...f.config.google, clientId: '' } },
      { origin, csrfKey: f.config.csrfKey, sessions: f.sessions },
    );
    const app = express();
    app.use('/api/portal', portal.api);
    f.sessions.available.mockRejectedValue(Error('disabled'));
    const b = await request(app).get('/api/portal/auth/logout-csrf');
    expect(b.status).toBe(200);
    const r = await request(app)
      .post('/api/portal/auth/logout')
      .set('Origin', origin)
      .set('Cookie', cookies(b))
      .set('X-Portal-CSRF', b.body.csrf);
    expect(r.status).toBe(200);
    expect(f.sessions.available).not.toHaveBeenCalled();
    expect((await request(app).get('/api/portal/auth/session')).status).toBe(503);
    expect(
      (
        await request(app)
          .post('/api/portal/auth/logout')
          .set('Cookie', cookies(b))
          .set('X-Portal-CSRF', b.body.csrf)
      ).status,
    ).toBe(403);
  },
);

it('rejects finish without exact origin or correctly bound CSRF and refuses callback replay', async () => {
  const f = setup(),
    a = await start(f);
  const callback = new URL(f.google.use(a.response.body.authorizationUrl));
  expect(
    (
      await request(f.app)
        .get(callback.pathname + callback.search)
        .set('Cookie', a.jar)
    ).status,
  ).toBe(303);
  expect(
    (
      await request(f.app)
        .get(callback.pathname + callback.search)
        .set('Cookie', a.jar)
    ).status,
  ).toBe(400);
  for (const originValue of ['', 'https://foreign.invalid']) {
    const r = await request(f.app)
      .post('/api/portal/auth/google/finish')
      .set('Cookie', a.jar)
      .set('Origin', originValue)
      .set('X-Portal-CSRF', 'invalid');
    expect(r.status).toBe(403);
  }
  expect(f.sessions.finish).not.toHaveBeenCalled();
});

it('maps identity conflict and DB failure without clearing credentials or leaking detail', async () => {
  const f = setup();
  f.sessions.authenticate.mockRejectedValueOnce(new AppError(409, 'private'));
  const r = await request(f.app)
    .get('/api/portal/auth/session')
    .set('Cookie', 'prisma_portal=' + 'a'.repeat(64));
  expect(r.status).toBe(409);
  expect(r.headers['set-cookie']).toBeUndefined();
  expect(r.text).not.toContain('private');
});

it('sets production Host cookie attributes after a successful commit only', async () => {
  const envBefore = process.env.NODE_ENV,
    urlBefore = process.env.APP_URL;
  try {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://portal.example.invalid';
    const f = setup();
    const core = createPortalHttp({
      ...f.config,
      google: {
        ...f.config.google,
        redirectUri: process.env.APP_URL + '/api/portal/auth/google/callback',
      },
    });
    const app = express();
    app.use('/api/portal', core.api);
    app.use('/app', core.app);
    // Synthetic correlation row is created through the real OIDC begin operation.
    const b = await request(app).get('/api/portal/auth/session');
    const s = await request(app)
      .post('/api/portal/auth/google/start')
      .set('Origin', process.env.APP_URL)
      .set('Cookie', cookies(b))
      .set('X-Portal-CSRF', b.body.csrf);
    const jar = [...cookies(b), ...cookies(s)];
    const p = await request(app).get('/app/auth/return').set('Cookie', jar);
    const csrf = p.text.match(/name="csrf" value="([^"]+)"/)![1];
    const response = await request(app)
      .post('/api/portal/auth/google/finish')
      .set('Origin', process.env.APP_URL)
      .set('Cookie', [...jar, ...cookies(p)])
      .set('X-Portal-CSRF', csrf);
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain('__Host-prisma_portal=');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
  } finally {
    if (envBefore === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = envBefore;
    if (urlBefore === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = urlBefore;
  }
});

it('bootstraps CSRF without issuing a session and starts a correlated Google request', async () => {
  const f = setup();
  const a = await start(f);
  const url = new URL(a.response.body.authorizationUrl);
  expect(url.origin).toBe('https://accounts.google.com');
  expect(url.searchParams.get('prompt')).toBe('select_account');
  expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
  expect(a.jar.join(';')).toContain('prisma_portal_login=');
  expect(a.jar.join(';')).not.toMatch(/prisma_portal=/);
  expect(f.sessions.finish).not.toHaveBeenCalled();
});

it.each([undefined, 'null', 'https://foreign.invalid'])(
  'rejects absent or foreign Origin %s',
  async (value) => {
    const f = setup();
    const b = await request(f.app).get('/api/portal/auth/session');
    let req = request(f.app)
      .post('/api/portal/auth/google/start')
      .set('Cookie', cookies(b))
      .set('X-Portal-CSRF', b.body.csrf);
    if (value) req = req.set('Origin', value);
    expect((await req).status).toBe(403);
    expect(f.sessions.expectedCrm).not.toHaveBeenCalled();
  },
);

it('rejects missing, incorrect and expired CSRF before creating attempts', async () => {
  const f = setup();
  const b = await request(f.app).get('/api/portal/auth/session');
  for (const token of ['', 'incorrect', b.body.csrf]) {
    if (token === b.body.csrf) vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
    const res = await request(f.app)
      .post('/api/portal/auth/google/start')
      .set('Origin', origin)
      .set('Cookie', cookies(b))
      .set('X-Portal-CSRF', token);
    expect(res.status).toBe(403);
  }
  expect(f.rows.size).toBe(0);
});

it('verifies callback without session, returns only locally and finishes with correlated CSRF', async () => {
  const f = setup();
  const a = await start(f);
  const callback = new URL(f.google.use(a.response.body.authorizationUrl));
  const c = await request(f.app)
    .get(callback.pathname + callback.search)
    .set('Cookie', a.jar);
  expect(c.status).toBe(303);
  expect(c.headers.location).toBe('/app/auth/return');
  expect(f.sessions.finish).not.toHaveBeenCalled();
  expect(c.headers['set-cookie']).toBeUndefined();
  const page = await request(f.app).get('/app/auth/return').set('Cookie', a.jar);
  expect(page.status).toBe(200);
  expect(page.headers['content-security-policy']).toContain("script-src 'nonce-");
  expect(page.text).not.toMatch(/private-user|synthetic-google-sub|id_token|access_token/);
  const csrf = page.text.match(/name="csrf" value="([^"]+)"/)![1];
  const finish = await request(f.app)
    .post('/api/portal/auth/google/finish')
    .set('Origin', origin)
    .set('Cookie', [...a.jar, ...cookies(page)])
    .set('X-Portal-CSRF', csrf);
  expect(finish.status).toBe(200);
  const session = (finish.headers['set-cookie'] as unknown as string[]).find((v) =>
    v.startsWith('prisma_portal='),
  )!;
  expect(session).toMatch(/HttpOnly/);
  expect(session).toMatch(/SameSite=Strict/);
  expect(session).toMatch(/Max-Age=28800/);
  expect(finish.body).not.toHaveProperty('token');
  expect(f.sessions.finish).toHaveBeenCalledOnce();
});

it('rejects crossed callbacks, wrong state, nonce and provider errors without session', async () => {
  for (const variant of ['cross', 'state', 'nonce', 'google']) {
    const f = setup();
    const a = await start(f);
    const callback = new URL(
      f.google.use(
        a.response.body.authorizationUrl,
        variant === 'nonce'
          ? { claims: { nonce: 'wrong' } }
          : variant === 'google'
            ? { fail: true }
            : {},
      ),
    );
    if (variant === 'state') callback.searchParams.set('state', opaque());
    const jar = variant === 'cross' ? a.initial : a.jar;
    const res = await request(f.app)
      .get(callback.pathname + callback.search)
      .set('Cookie', jar);
    expect(res.status).toBe(400);
    expect(res.headers.location).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(f.sessions.finish).not.toHaveBeenCalled();
  }
});

it('passes every CRM and portal cookie to the service, including duplicate and other-environment names', async () => {
  const f = setup();
  const b = await request(f.app).get('/api/portal/auth/session');
  await request(f.app)
    .post('/api/portal/auth/google/start')
    .set('Origin', origin)
    .set('Cookie', [
      ...cookies(b),
      'prisma_identity=A; prisma_identity=B; __Host-prisma_identity=C; prisma_admin=legacy; prisma_portal=D; __Host-prisma_portal=E',
    ])
    .set('X-Portal-CSRF', b.body.csrf);
  expect(f.sessions.expectedCrm).toHaveBeenCalledWith({
    crmTokens: ['A', 'B', 'C'],
    legacyPresent: true,
    portalTokens: ['D', 'E'],
  });
});

it('guards session with complete credentials, never refreshes and rejects ambiguous portal cookies', async () => {
  const f = setup();
  const token = 'a'.repeat(64);
  const res = await request(f.app)
    .get('/api/portal/auth/session')
    .set('Cookie', `prisma_portal=${token}; prisma_identity=A`);
  expect(res.status).toBe(200);
  expect(res.body.authenticated).toBe(true);
  expect(f.sessions.authenticate).toHaveBeenCalledWith(token, {
    crmTokens: ['A'],
    legacyPresent: false,
    portalTokens: [token],
  });
  expect(cookies(res).join(';')).not.toContain('prisma_portal=');
  expect(
    (
      await request(f.app)
        .get('/api/portal/auth/session')
        .set('Cookie', `prisma_portal=${token}; prisma_portal=${token}`)
    ).status,
  ).toBe(401);
});

it('does not emit session cookies when transactional finish fails', async () => {
  const f = setup();
  const a = await start(f);
  const page = await request(f.app).get('/app/auth/return').set('Cookie', a.jar);
  const csrf = page.text.match(/name="csrf" value="([^"]+)"/)![1];
  f.sessions.finish.mockRejectedValueOnce(Error('private database detail'));
  const res = await request(f.app)
    .post('/api/portal/auth/google/finish')
    .set('Origin', origin)
    .set('Cookie', [...a.jar, ...cookies(page)])
    .set('X-Portal-CSRF', csrf);
  expect(res.status).toBe(503);
  expect(res.headers['set-cookie']).toBeUndefined();
  expect(res.text).not.toContain('private database detail');
});

it('closes all flow endpoints and return when policy fails while preserving method and namespace errors', async () => {
  const f = setup();
  f.sessions.available.mockRejectedValue(Error('private'));
  for (const [method, path] of [
    ['get', '/api/portal/auth/session'],
    ['post', '/api/portal/auth/google/start'],
    ['get', '/api/portal/auth/google/callback'],
    ['post', '/api/portal/auth/google/finish'],
    ['get', '/app/auth/return'],
  ] as const)
    expect((await request(f.app)[method](path)).status).toBe(503);
  expect((await request(f.app).head('/api/portal/auth/session')).status).toBe(405);
  expect((await request(f.app).get('/api/portal/missing')).status).toBe(404);
  expect((await request(f.app).post('/api/portal/auth/logout')).status).toBe(403);
  expect((await request(f.app).get('/app/other')).status).toBe(503);
});

async function logoutCsrf(f: ReturnType<typeof setup>, jar: string[] = []) {
  const response = await request(f.app).get('/api/portal/auth/logout-csrf').set('Cookie', jar);
  expect(response.status).toBe(200);
  expect(Object.keys(response.body)).toEqual(['csrf']);
  expect(response.headers['cache-control']).toBe('no-store');
  return { csrf: response.body.csrf as string, jar: [...jar, ...cookies(response)] };
}

it('clears production portal cookies with matching Host attributes after commit', async () => {
  const oldEnv = process.env.NODE_ENV,
    oldUrl = process.env.APP_URL;
  try {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://portal.example.invalid';
    const f = setup();
    const p = createPortalHttp({
      ...f.config,
      google: {
        ...f.config.google,
        redirectUri: process.env.APP_URL + '/api/portal/auth/google/callback',
      },
    });
    const app = express();
    app.use('/api/portal', p.api);
    const b = await request(app)
      .get('/api/portal/auth/logout-csrf')
      .set('Cookie', '__Host-prisma_portal=' + 'a'.repeat(64));
    const r = await request(app)
      .post('/api/portal/auth/logout')
      .set('Origin', process.env.APP_URL)
      .set('Cookie', ['__Host-prisma_portal=' + 'a'.repeat(64), ...cookies(b)])
      .set('X-Portal-CSRF', b.body.csrf);
    expect(r.status).toBe(200);
    const cleared = r.headers['set-cookie'] as unknown as string[];
    expect(cleared).toHaveLength(3);
    for (const c of cleared) {
      expect(c).toContain('__Host-prisma_portal');
      expect(c).toContain('Secure');
      expect(c).toContain('HttpOnly');
      expect(c).toContain('Path=/');
      expect(c).not.toContain('Domain=');
      expect(c).toContain('Expires=Thu, 01 Jan 1970');
    }
    expect(cleared[0]).toContain('SameSite=Strict');
  } finally {
    if (oldEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv;
    if (oldUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = oldUrl;
  }
});
it('rejects expired logout CSRF while retaining retry cookies', async () => {
  const f = setup(),
    a = await logoutCsrf(f);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 300001);
  const r = await request(f.app)
    .post('/api/portal/auth/logout')
    .set('Origin', origin)
    .set('Cookie', a.jar)
    .set('X-Portal-CSRF', a.csrf);
  expect(r.status).toBe(403);
  expect(r.headers['set-cookie']).toBeUndefined();
  expect(f.sessions.logout).not.toHaveBeenCalled();
});

it.each(['valid', 'expired', 'revoked', 'conflict', 'disabled'])(
  'allows recovery logout for %s credentials without authorizing private access or touching CRM',
  async (state) => {
    const f = setup();
    f.sessions.available.mockRejectedValue(new AppError(503, 'private policy'));
    f.sessions.authenticate.mockRejectedValue(
      new AppError(state === 'conflict' ? 409 : 401, 'private'),
    );
    const a = await logoutCsrf(f, ['prisma_portal=' + 'a'.repeat(64), 'prisma_identity=CRM']);
    const response = await request(f.app)
      .post('/api/portal/auth/logout')
      .set('Origin', origin)
      .set('Cookie', a.jar)
      .set('X-Portal-CSRF', a.csrf);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authenticated: false });
    expect(f.sessions.logout).toHaveBeenCalledExactlyOnceWith({ portalTokens: ['a'.repeat(64)] });
    expect(f.sessions.available).not.toHaveBeenCalled();
    expect(f.sessions.authenticate).not.toHaveBeenCalled();
    expect(f.sessions.expectedCrm).not.toHaveBeenCalled();
    const cleared = response.headers['set-cookie'] as unknown as string[];
    expect(cleared).toHaveLength(3);
    expect(cleared.every((cookie) => /Expires=Thu, 01 Jan 1970/.test(cookie))).toBe(true);
    expect(cleared.join(';')).not.toContain('prisma_identity');
    expect(cleared.join(';')).not.toContain('prisma_admin');
    expect(response.headers['cache-control']).toBe('no-store');
  },
);

it('passes only the correlated attempt and portal credential to logout and supports anonymous retries', async () => {
  const f = setup();
  const id = '11111111-1111-4111-8111-111111111111',
    browser = opaque();
  const a = await logoutCsrf(f, [`prisma_portal_login=${id}.${browser}`]);
  const response = await request(f.app)
    .post('/api/portal/auth/logout')
    .set('Origin', origin)
    .set('Cookie', a.jar)
    .set('X-Portal-CSRF', a.csrf);
  expect(response.status).toBe(200);
  expect(f.sessions.logout).toHaveBeenCalledWith({
    portalTokens: [],
    correlation: { id, browserHash: digest(browser) },
  });
  const retry = await logoutCsrf(f);
  expect(
    (
      await request(f.app)
        .post('/api/portal/auth/logout')
        .set('Origin', origin)
        .set('Cookie', retry.jar)
        .set('X-Portal-CSRF', retry.csrf)
    ).status,
  ).toBe(200);
  expect(f.sessions.logout).toHaveBeenLastCalledWith({ portalTokens: [] });
});

it.each([
  'prisma_portal=bad',
  'prisma_portal=',
  `prisma_portal=${'a'.repeat(64)}; prisma_portal=${'a'.repeat(64)}`,
  `prisma_portal=${'a'.repeat(64)}; __Host-prisma_portal=${'b'.repeat(64)}`,
  'prisma_portal_login=bad',
  'prisma_portal_login=; prisma_portal_login=',
])('rejects malformed or ambiguous recovery credentials without clearing them: %s', async (jar) => {
  const f = setup();
  const a = await logoutCsrf(f);
  const get = await request(f.app).get('/api/portal/auth/logout-csrf').set('Cookie', jar);
  expect([401, 409]).toContain(get.status);
  expect(get.headers['set-cookie']).toBeUndefined();
  const response = await request(f.app)
    .post('/api/portal/auth/logout')
    .set('Origin', origin)
    .set('Cookie', [...a.jar, jar])
    .set('X-Portal-CSRF', a.csrf);
  expect([401, 409]).toContain(response.status);
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(f.sessions.logout).not.toHaveBeenCalled();
});

it('binds logout CSRF to the presented portal session and correlation, separate from login CSRF', async () => {
  const f = setup();
  const a = await logoutCsrf(f, ['prisma_portal=' + 'a'.repeat(64)]);
  const secret = a.jar.filter((v) => v.startsWith('prisma_portal_csrf='));
  for (const changed of [
    [],
    ['prisma_portal=' + 'b'.repeat(64)],
    [
      'prisma_portal=' + 'a'.repeat(64),
      `prisma_portal_login=11111111-1111-4111-8111-111111111111.${opaque()}`,
    ],
  ]) {
    const response = await request(f.app)
      .post('/api/portal/auth/logout')
      .set('Origin', origin)
      .set('Cookie', [...secret, ...changed])
      .set('X-Portal-CSRF', a.csrf);
    expect(response.status).toBe(403);
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  const login = await request(f.app).get('/api/portal/auth/session');
  expect(
    (
      await request(f.app)
        .post('/api/portal/auth/logout')
        .set('Origin', origin)
        .set('Cookie', cookies(login))
        .set('X-Portal-CSRF', login.body.csrf)
    ).status,
  ).toBe(403);
  expect(f.sessions.logout).not.toHaveBeenCalled();
});

it.each([undefined, 'null', 'https://foreign.invalid', origin + '/'])(
  'rejects logout Origin %s and invalid CSRF without changing cookies',
  async (value) => {
    const f = setup();
    const a = await logoutCsrf(f);
    let req = request(f.app)
      .post('/api/portal/auth/logout')
      .set('Cookie', a.jar)
      .set('X-Portal-CSRF', a.csrf);
    if (value) req = req.set('Origin', value);
    const response = await req;
    expect(response.status).toBe(403);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(f.sessions.logout).not.toHaveBeenCalled();
  },
);

it('preserves logout credentials on persistence failure and sanitizes service errors', async () => {
  const f = setup();
  const a = await logoutCsrf(f, ['prisma_portal=' + 'a'.repeat(64)]);
  for (const error of [
    Error('private DB detail'),
    new AppError(401, 'private identity'),
    new AppError(409, 'private identity'),
  ]) {
    f.sessions.logout.mockRejectedValueOnce(error);
    const response = await request(f.app)
      .post('/api/portal/auth/logout')
      .set('Origin', origin)
      .set('Cookie', a.jar)
      .set('X-Portal-CSRF', a.csrf);
    expect(response.status).toBe(error instanceof AppError ? error.status : 503);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.text).not.toContain('private');
  }
});
