import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindingRouter } from '../server/binding-http';
import { memoryOidcStore, options, simulatedGoogle } from './oidc-helper';
import { digest } from '../server/oidc-crypto';
const h = vi.hoisted(() => ({ memory: null as any, context: vi.fn(), submit: vi.fn() }));
vi.mock('../server/binding-operations.js', () => ({
  bindingPreflight: async () => {},
  bindingMaintenance: async () => {},
  bindingContext: (...args: any[]) => h.context(...args),
  bindingAttempt: async (id: string, browser: string) => {
    const row = h.memory.rows.get(id);
    if (!row || row.browserHash !== digest(browser)) throw Error();
    return { context: row.context, status: row.status };
  },
  browserBindings: () => ({ submitCandidate: (...args: any[]) => h.submit(...args) }),
}));
vi.mock('../server/oidc-store.js', async (original) => ({
  ...(await original<object>()),
  mysqlOidcStore: () => h.memory.store,
}));
vi.mock('../server/db.js', () => ({
  query: async (sql: string, values: any[] = []) => {
    if (sql.includes("name='020.sql'")) return [{ name: '020.sql' }];
    if (sql.includes('WHERE state_hash=')) {
      const row: any = [...h.memory.rows.values()].find((r: any) => r.stateHash === values[0]);
      return row
        ? [{ id: row.id, browser_hash: row.browserHash, purpose: row.context.purpose }]
        : [];
    }
    return [];
  },
}));
const origin = 'http://localhost:5173';
const csrf = (html: string) => html.match(/name="csrf" value="([^"]+)"/)![1];
const cookies = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)?.map((c) => c.split(';')[0]) || [];
let warn: ReturnType<typeof vi.spyOn>;
function setup() {
  const google = simulatedGoogle();
  const app = express();
  app.use(
    bindingRouter({
      google: options,
      csrfKey: 'cd'.repeat(32),
      database: 'synthetic',
      loginEnabled: true,
      transport: google.transport,
    }),
  );
  app.get('/api/auth/session', (_req, res) => res.json(res.locals.googleLogin));
  return { app, google };
}
beforeEach(() => {
  vi.useRealTimers();
  h.memory = memoryOidcStore();
  h.context.mockReset().mockRejectedValue(Error('private synthetic operation unavailable'));
  h.submit.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('rejects an expired form with recoverable text, safe diagnostics and no new OAuth attempt', async () => {
  const { app } = setup();
  const page = await request(app).get('/vincular-google');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 300001);
  const denied = await request(app)
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .set('Sec-Fetch-Site', 'same-origin')
    .type('form')
    .send({ operationId: 'private-operation', code: 'sensitive-code', csrf: csrf(page.text) });
  expect(denied.status).toBe(403);
  expect(denied.text).toContain('Reiniciar formulario');
  expect(denied.text).toContain('formulario');
  expect(denied.text).not.toContain('Cancelar intento');
  expect(denied.text).not.toContain('<form');
  expect(denied.headers.location).toBeUndefined();
  expect(denied.headers['set-cookie']).toBeUndefined();
  expect(h.memory.rows.size).toBe(0);
  expect(warn).toHaveBeenCalledWith('binding.request_rejected', {
    action: 'start',
    reason: 'csrf_expired',
  });
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(
    /sensitive-code|private-operation|localhost|csrf=.*v1/,
  );
});
it.each([
  ['absent', 'origin_missing'],
  ['null', 'origin_null'],
  ['https://external.invalid', 'origin_mismatch'],
])('diagnoses %s Origin without reflecting it or reaching authorization', async (value, reason) => {
  const { app } = setup();
  const page = await request(app).get('/vincular-google');
  let r = request(app)
    .post('/api/auth/google/binding/start')
    .set('Cookie', cookies(page))
    .type('form');
  if (value !== 'absent') r = r.set('Origin', value);
  const denied = await r.send({ csrf: csrf(page.text), code: 'private' });
  expect(denied.status).toBe(403);
  expect(warn).toHaveBeenCalledWith('binding.request_rejected', { action: 'start', reason });
  expect(h.context).not.toHaveBeenCalled();
});
it('rejects cross-site and duplicate cookie contexts independently', async () => {
  const { app } = setup();
  const p = await request(app).get('/vincular-google');
  await request(app)
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .set('Sec-Fetch-Site', 'cross-site')
    .set('Cookie', cookies(p))
    .type('form')
    .send({ csrf: csrf(p.text) })
    .expect(403);
  expect(warn).toHaveBeenLastCalledWith('binding.request_rejected', {
    action: 'start',
    reason: 'fetch_site_invalid',
  });
  await request(app)
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .set('Cookie', [...cookies(p), ...cookies(p)])
    .type('form')
    .send({ csrf: csrf(p.text) })
    .expect(403);
  expect(warn).toHaveBeenLastCalledWith('binding.request_rejected', {
    action: 'start',
    reason: 'csrf_cookie_duplicate',
  });
});
it('only explicit GET recovery replaces stale cookies and presents a fresh start form without side effects', async () => {
  const { app } = setup();
  const old = await request(app).get('/vincular-google');
  const fresh = await request(app)
    .get('/vincular-google?form=restart')
    .set('Cookie', [...cookies(old), 'prisma_binding=stale'])
    .expect(200);
  expect(fresh.text).toContain('Continuar con Google');
  expect(fresh.text).not.toContain('stale');
  expect(csrf(fresh.text)).not.toBe(csrf(old.text));
  expect(String(fresh.headers['set-cookie'])).toContain('Max-Age=300');
  expect(String(fresh.headers['set-cookie'])).toContain('HttpOnly');
  expect(String(fresh.headers['set-cookie'])).toContain('SameSite=Lax');
  expect(fresh.headers['cache-control']).toBe('no-store');
  expect(fresh.headers.location).toBeUndefined();
  expect(h.context).not.toHaveBeenCalled();
  expect(h.memory.rows.size).toBe(0);
  const jar = cookies(fresh).filter((c) => c.startsWith('prisma_binding_csrf='));
  await request(app)
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .set('Cookie', jar)
    .type('form')
    .send({
      operationId: '123e4567-e89b-12d3-a456-426614174000',
      code: 'aa'.repeat(32),
      csrf: csrf(fresh.text),
    })
    .expect(400);
  expect(h.context).toHaveBeenCalledOnce(); // Passed CSRF; the synthetic private authorization still rejects.
});
it('keeps the signed Google binding callback and confirmation flow working with opaque correlation', async () => {
  const { app, google } = setup();
  const context = {
    purpose: 'binding',
    userId: '123e4567-e89b-12d3-a456-426614174000',
    operationId: '223e4567-e89b-12d3-a456-426614174000',
  };
  h.context.mockResolvedValue(context);
  const agent = request.agent(app);
  const p = await agent.get('/vincular-google');
  const start = await agent
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .type('form')
    .send({ operationId: context.operationId, code: 'ab'.repeat(32), csrf: csrf(p.text) })
    .expect(303);
  const callback = new URL(google.use(start.headers.location));
  await agent.get(callback.pathname + callback.search).expect(303);
  const confirm = await agent.get('/vincular-google').expect(200);
  expect(confirm.text).toContain('Presentar candidatura');
  expect([...h.memory.rows.values()][0].status).toBe('verified');
  expect(warn).not.toHaveBeenCalled();
});
it('preserves the administrative Google login CSRF format and method protection', async () => {
  const { app } = setup();
  const agent = request.agent(app);
  const bootstrap = await agent.get('/api/auth/session').expect(200);
  expect(bootstrap.body.csrf).toMatch(/^[a-f0-9]{64}$/);
  await agent
    .post('/api/auth/google/login/start')
    .set('Origin', origin)
    .type('form')
    .send({ csrf: bootstrap.body.csrf })
    .expect(303);
  await agent.get('/api/auth/google/binding/start').expect(405);
  expect(warn).not.toHaveBeenCalled();
});

it.each([
  ['submit', '/api/auth/google/binding/submit'],
  ['cancel', '/api/auth/google/binding/cancel'],
])('diagnoses %s without invoking its effect when the cookie is missing', async (action, path) => {
  const { app } = setup();
  const page = await request(app).get('/vincular-google');
  await request(app)
    .post(path)
    .set('Origin', origin)
    .type('form')
    .send({ csrf: csrf(page.text), code: 'do-not-log' })
    .expect(403);
  expect(warn).toHaveBeenCalledWith('binding.request_rejected', {
    action,
    reason: 'csrf_cookie_missing',
  });
  expect(h.submit).not.toHaveBeenCalled();
  expect(h.memory.rows.size).toBe(0);
});
it('recovers a pre-update form only through explicit restart without accepting its old CSRF', async () => {
  const { app } = setup();
  const legacy = 'prisma_binding_csrf=' + 'a'.repeat(43);
  const rejected = await request(app)
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .set('Cookie', legacy)
    .type('form')
    .send({ csrf: 'ab'.repeat(32) })
    .expect(403);
  expect(rejected.text).toContain('Reiniciar formulario');
  expect(rejected.headers['set-cookie']).toBeUndefined();
  expect(warn).toHaveBeenCalledWith('binding.request_rejected', {
    action: 'start',
    reason: 'csrf_cookie_invalid',
  });
  const fresh = await request(app)
    .get('/vincular-google?form=restart')
    .set('Cookie', legacy)
    .expect(200);
  const jar = cookies(fresh).filter((c) => c.startsWith('prisma_binding_csrf='));
  await request(app)
    .post('/api/auth/google/binding/start')
    .set('Origin', origin)
    .set('Cookie', jar)
    .type('form')
    .send({
      operationId: '123e4567-e89b-12d3-a456-426614174000',
      code: 'ab'.repeat(32),
      csrf: csrf(fresh.text),
    })
    .expect(400);
  expect(h.context).toHaveBeenCalledOnce();
  expect(h.memory.rows.size).toBe(0);
});
