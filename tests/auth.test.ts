import { it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
import { testCredentials, memorySessions } from './auth-helper.js';
const credentials = await testCredentials();
const store = memorySessions();
const app = createApp({ ...credentials, store });
afterAll(() => pool.end());
it('API administrativa sin sesión devuelve 401', async () => {
  expect((await request(app).get('/api/people')).status).toBe(401);
  expect((await request(app).post('/api/import/commit').send({})).status).toBe(401);
});
it('login incorrecto no crea cookie ni sesión', async () => {
  const r = await request(app)
    .post('/api/auth/login')
    .send({ password: randomBytes(20).toString('hex') });
  expect(r.status).toBe(401);
  expect(r.headers['set-cookie']).toBeUndefined();
});
it('login válido, cookie segura, sesión, logout y revocación', async () => {
  const r = await request(app).post('/api/auth/login').send({ password: credentials.password });
  expect(r.status).toBe(200);
  const cookie = r.headers['set-cookie'][0];
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).not.toContain(credentials.password);
  expect(
    (await request(app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated,
  ).toBe(true);
  expect((await request(app).get('/api/missing').set('Cookie', cookie)).status).toBe(404);
  expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(200);
  expect(
    (await request(app).get('/api/auth/session').set('Cookie', cookie)).body.authenticated,
  ).toBe(false);
});
it('rotación de secreto o hash invalida sesiones anteriores', async () => {
  const r = await request(app).post('/api/auth/login').send({ password: credentials.password });
  const rotated = createApp({ ...credentials, secret: randomBytes(48).toString('hex'), store });
  expect(
    (await request(rotated).get('/api/auth/session').set('Cookie', r.headers['set-cookie'][0])).body
      .authenticated,
  ).toBe(false);
});
it('limita intentos de login', async () => {
  const limited = createApp({ ...credentials, store: memorySessions() });
  // Invalid shape still consumes attempts without running costly password hashing.
  for (let i = 0; i < 10; i++)
    expect((await request(limited).post('/api/auth/login').send({})).status).toBe(422);
  expect((await request(limited).post('/api/auth/login').send({})).status).toBe(429);
});
it('login rechaza origen externo', async () =>
  expect(
    (
      await request(app)
        .post('/api/auth/login')
        .set('Origin', 'https://evil.invalid')
        .send({ password: credentials.password })
    ).status,
  ).toBe(403));

it('rechaza sesión vencida y cookie manipulada', async () => {
  const expired = createApp({
    ...credentials,
    store: {
      async get() {
        return Date.now() - 1;
      },
      async set() {},
      async delete() {},
    },
  });
  const r = await request(expired).post('/api/auth/login').send({ password: credentials.password });
  expect(
    (await request(expired).get('/api/people').set('Cookie', r.headers['set-cookie'][0])).status,
  ).toBe(401);
  expect(
    (await request(app).get('/api/people').set('Cookie', 'prisma_admin=manipulada')).status,
  ).toBe(401);
});
it('usa cookie Secure y prefijo Host en producción', async () => {
  const before = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const secure = createApp({ ...credentials, store: memorySessions() });
    const r = await request(secure)
      .post('/api/auth/login')
      .send({ password: credentials.password });
    expect(r.headers['set-cookie'][0]).toContain('__Host-prisma_admin=');
    expect(r.headers['set-cookie'][0]).toContain('Secure');
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
});
