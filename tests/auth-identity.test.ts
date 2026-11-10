import { afterAll, afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import * as identity from '../server/identity';
import { pool } from '../server/db';
import { options } from './oidc-helper';
import { memorySessions, testCredentials } from './auth-helper';

const credentials = await testCredentials();
const user = {
  id: 'synthetic',
  display_name: 'Synthetic admin',
  status: 'enabled' as const,
  roles: ['admin' as const],
  expiresAt: Date.now() + 60000,
};
const token = 'a'.repeat(64);
const app = (enabled = true, configured = true) =>
  createApp(
    {
      ...(configured ? credentials : { hash: '', secret: '' }),
      store: memorySessions(),
      identityEnabled: enabled,
    },
    {},
    {},
    false,
  );
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

it('autoriza identidad sin configuración legacy y publica principal y vencimiento', async () => {
  const authenticate = vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue(user);
  const instance = app(true, false);
  const response = await request(instance)
    .get('/api/auth/session')
    .set('Cookie', `prisma_identity=${token}`);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    authenticated: true,
    configured: false,
    method: 'identity',
    identity: { userId: user.id, displayName: user.display_name, roles: ['admin'] },
    expiresAt: user.expiresAt,
    legacy: { available: false },
  });
  expect(authenticate).toHaveBeenCalledWith(token, 'crm', { requireInstitution: true });
  expect(
    (await request(instance).get('/api/missing').set('Cookie', `prisma_identity=${token}`)).status,
  ).toBe(404);
});

it('deniega identidad inválida y no cae en legacy aunque sea válido', async () => {
  vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue(undefined);
  const instance = app();
  const login = await request(instance)
    .post('/api/auth/login')
    .send({ password: credentials.password });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  expect(
    (
      await request(instance)
        .get('/api/missing')
        .set('Cookie', [cookie, `prisma_identity=${token}`])
    ).status,
  ).toBe(409);
  expect(
    (await request(instance).get('/api/missing').set('Cookie', 'prisma_identity=bad')).status,
  ).toBe(401);
});

it('rechaza conflicto de autoridades incluso malformadas y login legacy durante Google', async () => {
  const instance = app();
  expect(
    (
      await request(instance)
        .get('/api/missing')
        .set('Cookie', 'prisma_admin=bad; prisma_identity=bad')
    ).status,
  ).toBe(409);
  for (const cookie of ['prisma_identity=bad', 'prisma_login=pending'])
    expect(
      (
        await request(instance)
          .post('/api/auth/login')
          .set('Cookie', cookie)
          .send({ password: credentials.password })
      ).status,
    ).toBe(409);
});

it('DB indisponible falla cerrado con 503 y estado sin caché', async () => {
  vi.spyOn(identity, 'authenticateIdentitySession').mockRejectedValue(Error('private DB detail'));
  const response = await request(app())
    .get('/api/auth/session')
    .set('Cookie', `prisma_identity=${token}`);
  expect(response.status).toBe(503);
  expect(response.body.authenticated).toBe(false);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(JSON.stringify(response.body)).not.toContain('private DB detail');
});

it('logout revoca por token, elimina ambas cookies y admite repetición', async () => {
  const revoke = vi.spyOn(identity, 'revokePresentedIdentitySession').mockResolvedValue(undefined);
  const instance = app();
  const login = await request(instance)
    .post('/api/auth/login')
    .send({ password: credentials.password });
  const legacy = login.headers['set-cookie'][0].split(';')[0];
  for (let i = 0; i < 2; i++) {
    const response = await request(instance)
      .post('/api/auth/logout')
      .set('Cookie', [legacy, `prisma_identity=${token}`]);
    expect(response.status).toBe(200);
    expect(String(response.headers['set-cookie'])).toContain('prisma_identity=;');
    expect(String(response.headers['set-cookie'])).toContain('prisma_admin=;');
  }
  expect(revoke).toHaveBeenCalledWith(token);
  expect(
    (await request(instance).get('/api/auth/session').set('Cookie', legacy)).body.authenticated,
  ).toBe(false);
});

it('logout fallido no declara éxito ni elimina credenciales necesarias para reintentar', async () => {
  vi.spyOn(identity, 'revokePresentedIdentitySession').mockRejectedValue(Error('private'));
  const response = await request(app())
    .post('/api/auth/logout')
    .set('Cookie', `prisma_identity=${token}`);
  expect(response.status).toBe(503);
  expect(response.headers['set-cookie']).toBeUndefined();
});

it('Google deshabilitado conserva el contrato legacy', async () => {
  const authenticate = vi.spyOn(identity, 'authenticateIdentitySession');
  const response = await request(app(false))
    .get('/api/auth/session')
    .set('Cookie', 'prisma_identity=bad');
  expect(response.body).toEqual({ authenticated: false, configured: true });
  expect(authenticate).not.toHaveBeenCalled();
});

it('logout cancela el intento Google presentado antes de borrar sus cookies', async () => {
  const cancel = vi.spyOn(identity, 'cancelPresentedGoogleLogin').mockResolvedValue(undefined);
  const instance = createApp(
    { ...credentials, store: memorySessions() },
    {},
    {},
    { google: options, csrfKey: 'cd'.repeat(32), database: 'synthetic', loginEnabled: true },
  );
  const response = await request(instance)
    .post('/api/auth/logout')
    .set('Cookie', 'prisma_login=123e4567-e89b-42d3-a456-426614174000.' + 'a'.repeat(43));
  expect(response.status).toBe(200);
  expect(cancel).toHaveBeenCalled();
  expect(String(response.headers['set-cookie'])).toContain('prisma_login=;');
});

it('ambas cookies válidas requieren logout y nunca eligen una autoridad', async () => {
  vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue(user);
  const instance = app();
  const login = await request(instance)
    .post('/api/auth/login')
    .send({ password: credentials.password });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const response = await request(instance)
    .get('/api/auth/session')
    .set('Cookie', [cookie, `prisma_identity=${token}`]);
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({
    authenticated: false,
    method: null,
    identity: null,
    status: 'conflict',
  });
});

it('logout sigue intentando legacy cuando falla revocación individual', async () => {
  vi.spyOn(identity, 'revokePresentedIdentitySession').mockRejectedValue(Error('outage'));
  const instance = app();
  const login = await request(instance)
    .post('/api/auth/login')
    .send({ password: credentials.password });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await request(instance)
    .post('/api/auth/logout')
    .set('Cookie', [cookie, `prisma_identity=${token}`])
    .expect(503);
  expect(
    (await request(instance).get('/api/auth/session').set('Cookie', cookie)).body.authenticated,
  ).toBe(false);
});

it('logout rechaza solicitudes externas antes de cualquier revocación', async () => {
  const revoke = vi.spyOn(identity, 'revokePresentedIdentitySession').mockResolvedValue(undefined);
  await request(app())
    .post('/api/auth/logout')
    .set('Origin', 'https://evil.invalid')
    .set('Cookie', `prisma_identity=${token}`)
    .expect(403);
  expect(revoke).not.toHaveBeenCalled();
});

it('logout produce cookies compatibles con emisión en producción', async () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    vi.spyOn(identity, 'revokePresentedIdentitySession').mockResolvedValue(undefined);
    const response = await request(app())
      .post('/api/auth/logout')
      .set('Cookie', `__Host-prisma_identity=${token}`);
    expect(response.status).toBe(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    for (const name of ['__Host-prisma_identity', '__Host-prisma_admin']) {
      const cookie = cookies.find((value) => value.startsWith(name + '='))!;
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).not.toContain('Domain=');
    }
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
  }
});

it('una sesión inválida no se confunde con servicio indisponible', async () => {
  vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue(undefined);
  const response = await request(app())
    .get('/api/auth/session')
    .set('Cookie', `prisma_identity=${token}`);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ authenticated: false, status: 'invalid', method: null });
});

it('logout invalida todos los tokens legacy presentados con el mismo nombre', async () => {
  const instance = app();
  const cookies: string[] = [];
  for (let i = 0; i < 2; i++) {
    const login = await request(instance)
      .post('/api/auth/login')
      .send({ password: credentials.password });
    cookies.push(login.headers['set-cookie'][0].split(';')[0]);
  }
  await request(instance).post('/api/auth/logout').set('Cookie', cookies).expect(200);
  for (const cookie of cookies)
    expect(
      (await request(instance).get('/api/auth/session').set('Cookie', cookie)).body.authenticated,
    ).toBe(false);
});

it('login deshabilitado no declara logout exitoso si falla revocar una identidad residual', async () => {
  vi.spyOn(identity, 'revokePresentedIdentitySession').mockRejectedValue(Error('outage'));
  const response = await request(app(false))
    .post('/api/auth/logout')
    .set('Cookie', `prisma_identity=${token}`);
  expect(response.status).toBe(503);
  expect(response.headers['set-cookie']).toBeUndefined();
});

it('rechaza cookies individuales duplicadas sin elegir un valor, incluso junto a legacy', async () => {
  const authenticate = vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue(user);
  const instance = app();
  const cookies = [`prisma_identity=${token}`, `prisma_identity=${'b'.repeat(64)}`];
  await request(instance).get('/api/missing').set('Cookie', cookies).expect(401);
  const session = await request(instance)
    .get('/api/auth/session')
    .set('Cookie', cookies)
    .expect(200);
  expect(session.body).toMatchObject({ authenticated: false, method: null, status: 'invalid' });
  await request(instance)
    .get('/api/missing')
    .set('Cookie', [...cookies, 'prisma_admin=bad'])
    .expect(409);
  expect(authenticate).not.toHaveBeenCalled();
});
