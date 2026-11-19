import { afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
import { memorySessions, testCredentials } from './auth-helper.js';

const credentials = await testCredentials();
const app = createApp({ ...credentials, store: memorySessions() }, {}, {}, false);
afterAll(() => pool.end());
const routes = [
  ['get', '/auth/session'],
  ['post', '/auth/google/start'],
  ['get', '/auth/google/callback'],
  ['post', '/auth/google/finish'],
  ['post', '/auth/logout'],
  ['get', '/auth/logout-csrf'],
] as const;

it.each(routes)(
  '%s %s stays unavailable without authentication or cookies',
  async (method, path) => {
    const response = await request(app)[method]('/api/portal' + path);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('portal_unavailable');
    expect(response.body.authenticated).not.toBe(true);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
  },
);

it.each(routes)('rejects other methods for %s %s without CRM fallthrough', async (method, path) => {
  for (const other of ['get', 'post', 'put', 'delete', 'head', 'options'] as const) {
    if (other === method) continue;
    const response = await request(app)[other]('/api/portal' + path);
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe(method.toUpperCase());
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['content-type']).toContain('application/json');
  }
});

it.each(['/api/portal', '/api/portal/', '/api/portal/missing', '/api/portal/auth/session/extra'])(
  'terminates unknown namespace route %s',
  async (path) => {
    for (const method of ['get', 'post', 'options'] as const) {
      const response = await request(app)[method](path);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('portal_not_found');
      expect(response.headers['content-type']).toContain('application/json');
    }
  },
);

it('rejects even malformed bodies before the administrative parser and ignores credentials', async () => {
  const response = await request(app)
    .post('/api/portal/auth/google/start')
    .set('Origin', 'https://external.invalid')
    .set('Content-Type', 'application/json')
    .set('Cookie', 'prisma_identity=invalid; prisma_portal=invalid')
    .send('{');
  expect(response.status).toBe(503);
  expect(response.body.code).toBe('portal_unavailable');
  expect(response.headers['set-cookie']).toBeUndefined();
});

it.each(['/app', '/app/', '/app/auth/return'])(
  'reserves %s without the administrative SPA',
  async (path) => {
    const response = await request(app).get(path);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('portal_unavailable');
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
  },
);

it('preserves CRM login, session, protected routes, errors and logout independently', async () => {
  expect((await request(app).get('/api/people')).status).toBe(401);
  expect(
    (
      await request(app)
        .get('/api/people')
        .set('Cookie', 'prisma_portal=' + 'a'.repeat(64))
    ).status,
  ).toBe(401);
  const login = await request(app).post('/api/auth/login').send({ password: credentials.password });
  expect(login.status).toBe(200);
  const cookie = login.headers['set-cookie'][0];
  expect(
    (await request(app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated,
  ).toBe(true);
  for (const [method, path] of routes) {
    const pending = request(app)[method]('/api/portal' + path);
    const response = await pending.set('Cookie', cookie);
    expect(response.status).toBe(503);
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  expect((await request(app).get('/api/missing').set('Cookie', cookie)).status).toBe(404);
  expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(200);
  expect(
    (await request(app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated,
  ).toBe(false);
});
