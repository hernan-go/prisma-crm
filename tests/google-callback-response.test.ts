import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../server/errors';
import { bindingRouter } from '../server/binding-http';
import { query } from '../server/db';
import { completeGoogleLogin } from '../server/identity';

vi.mock('../server/db', () => ({ query: vi.fn() }));
vi.mock('../server/binding-operations', () => ({
  browserBindings: () => ({}),
  bindingPreflight: vi.fn(),
  bindingMaintenance: vi.fn(),
}));
vi.mock('../server/identity', () => ({ completeGoogleLogin: vi.fn() }));
const { begin } = vi.hoisted(() => ({ begin: vi.fn() }));
vi.mock('../server/google-oidc', () => ({
  createGoogleOidc: () => ({ begin, complete: vi.fn(), evidenceReference: vi.fn() }),
}));

it('requires the exact HTTPS origin and matching CSRF before starting Google login', async () => {
  const origin = 'https://crm.example';
  vi.mocked(query).mockResolvedValue([{ name: '020.sql' }]);
  const app = express().use(
    bindingRouter({
      google: {
        redirectUri: origin + '/api/auth/google/callback',
        clientId: 'test',
        clientSecret: 'test',
        activeKeyId: 'test',
        keys: {},
      },
      csrfKey: 'ab'.repeat(32),
      database: 'synthetic',
      loginEnabled: true,
      bindingEnabled: false,
    }),
  );
  app.get('/api/auth/session', (_req, res) => res.json(res.locals.googleLogin));
  const session = await request(app).get('/api/auth/session').expect(200);
  const csrf = session.body.csrf;
  const cookie = session.headers['set-cookie'][0].split(';')[0];
  const post = (source: string) =>
    request(app)
      .post('/api/auth/google/login/start')
      .set('Origin', source)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Cookie', cookie)
      .type('form');
  for (const source of ['null', 'https://other.example']) {
    await post(source).send({ csrf }).expect(403);
  }
  await post(origin).send({}).expect(400);
  await post(origin)
    .send({ csrf: '0'.repeat(64) })
    .expect(403);
  expect(begin).not.toHaveBeenCalled();
  const authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  begin.mockResolvedValueOnce({
    authorizationUrl,
    attemptId: randomUUID(),
    browserToken: 'a'.repeat(43),
  });
  await post(origin).send({ csrf }).expect(303).expect('Location', authorizationUrl);
  expect(begin).toHaveBeenCalledWith({ purpose: 'login' });
});

it.each([true, false])(
  'renders the correct browser response for authorization denial=%s',
  async (denied) => {
    const id = randomUUID();
    const browser = 'a'.repeat(43);
    vi.mocked(query).mockImplementation(async (sql) =>
      sql.includes('state_hash=?')
        ? [
            {
              id,
              browser_hash: createHash('sha256').update(browser).digest('hex'),
              purpose: 'login',
            },
          ]
        : [{ name: '020.sql' }],
    );
    vi.mocked(completeGoogleLogin).mockRejectedValueOnce(
      denied ? new AppError(403, 'private detail') : Error('private detail'),
    );
    const app = express().use(
      bindingRouter({
        google: {
          redirectUri: 'http://localhost:5173/api/auth/google/callback',
          clientId: 'test',
          clientSecret: 'test',
          activeKeyId: 'test',
          keys: {},
        },
        csrfKey: 'ab'.repeat(32),
        database: 'synthetic',
        loginEnabled: true,
      }),
    );
    const res = await request(app)
      .get('/api/auth/google/callback?state=' + 'b'.repeat(43))
      .set('Cookie', 'prisma_login=' + id + '.' + browser)
      .expect(denied ? 303 : 400);
    if (denied) expect(res.headers.location).toBe('/login?google=denied');
    else expect(res.type).toBe('text/html');
    expect(res.text).not.toContain('private detail');
    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain('prisma_login=;');
    expect(cookies).toContain('prisma_login_csrf=;');
    expect(cookies).not.toContain('prisma_identity=');
  },
);
