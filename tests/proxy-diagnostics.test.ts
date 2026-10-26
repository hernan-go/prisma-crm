import { afterAll, afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { createProxyDiagnostics } from '../server/proxy-diagnostics.js';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
import * as diagnosticFiles from '../server/proxy-diagnostic-file.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => pool.end());

function probeApp(hops = 1, enabled = true, now = () => 0) {
  const log = vi.fn();
  const observe = createProxyDiagnostics({ enabled, log, now });
  const app = express();
  app.set('trust proxy', hops);
  app.get('/session', (req, res) => {
    observe(req);
    res.json({ ok: true });
  });
  return { app, log };
}

it('apagado por defecto y marcador desconocido no producen registros', async () => {
  vi.stubEnv('PROXY_DIAGNOSTICS', 'false');
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const app = express();
  const observe = createProxyDiagnostics();
  app.get('/', (req, res) => {
    observe(req);
    res.end();
  });
  await request(app).get('/').set('X-Proxy-Check', 'baseline');
  expect(log).not.toHaveBeenCalled();
  const enabled = probeApp();
  await request(enabled.app).get('/session').set('X-Proxy-Check', 'unknown-secret-value');
  await request(enabled.app).get('/session');
  await request(enabled.app).head('/session').set('X-Proxy-Check', 'baseline');
  expect(enabled.log).not.toHaveBeenCalled();
});

it.each([0, 1])(
  'mide TRUST_PROXY=%s sin confundir TLS del socket y protocolo interpretado',
  async (hops) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://crm.example.invalid');
    const { app, log } = probeApp(hops);
    const response = await request(app)
      .get('/session')
      .set('Host', 'crm.example.invalid')
      .set('X-Proxy-Check', 'baseline')
      .set('X-Forwarded-Proto', 'https');
    expect(response.body).toEqual({ ok: true });
    expect(log.mock.calls[0][0]).toMatchObject({
      event: 'proxy_diagnostic',
      probe: 'baseline',
      socket_tls: false,
      forwarded_proto: 'https',
      forwarded_proto_exact_https: true,
      express_protocol: hops ? 'https' : 'http',
      express_secure: Boolean(hops),
      trust_proxy_hops: hops,
      node_env: 'production',
      host_matches_app_url: true,
    });
    expect(log.mock.calls[0][0].socket_peer).toMatch(/^(127\.0\.0\.1|::1)$/);
    expect(log.mock.calls[0][0].socket_local_port).toBeGreaterThan(0);
  },
);

it('muestra el efecto de una cabecera falsa o encadenada sin otorgar confianza', async () => {
  const { app, log } = probeApp();
  await request(app)
    .get('/session')
    .set('X-Proxy-Check', 'proto-http')
    .set('X-Forwarded-Proto', 'http');
  await request(app)
    .get('/session')
    .set('X-Proxy-Check', 'proto-chain')
    .set('X-Forwarded-Proto', 'https,http');
  expect(log.mock.calls[0][0]).toMatchObject({
    forwarded_proto: 'http',
    express_protocol: 'http',
    express_secure: false,
  });
  expect(log.mock.calls[1][0]).toMatchObject({
    forwarded_proto: 'https,http',
    forwarded_proto_exact_https: false,
    express_protocol: 'https',
  });
});

it('lista blanca no registra secretos ni Host/encabezados/entorno arbitrarios', async () => {
  vi.stubEnv('NODE_ENV', 'private-environment-value');
  const { app, log } = probeApp();
  await request(app)
    .get('/session?secret=private-query')
    .set('X-Proxy-Check', 'baseline')
    .set('Cookie', 'private-cookie')
    .set('Authorization', 'Bearer private-token')
    .set('Host', 'private-host.invalid')
    .set('X-Forwarded-Proto', 'private-protocol')
    .set('X-Forwarded-For', '203.0.113.99');
  expect(log.mock.calls[0][0]).toMatchObject({
    forwarded_proto: 'other',
    express_protocol: 'other',
    node_env: 'other',
    host_matches_app_url: false,
  });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /private-|203\.0\.113\.99|Authorization|Cookie/,
  );
});

it('expira a diez minutos y limita a doce registros por proceso', async () => {
  let now = 0;
  const timed = probeApp(1, true, () => now);
  await request(timed.app).get('/session').set('X-Proxy-Check', 'baseline');
  now = 600000;
  await request(timed.app).get('/session').set('X-Proxy-Check', 'baseline');
  expect(timed.log).toHaveBeenCalledTimes(1);
  const capped = probeApp();
  for (let i = 0; i < 15; i++)
    await request(capped.app).get('/session').set('X-Proxy-Check', 'baseline');
  expect(capped.log).toHaveBeenCalledTimes(12);
});

it('fallo del destino de logs no altera la respuesta', async () => {
  const observe = createProxyDiagnostics({
    enabled: true,
    log: () => {
      throw Error('sink failure');
    },
  });
  const app = express();
  app.get('/', (req, res) => {
    observe(req);
    res.json({ ok: true });
  });
  expect((await request(app).get('/').set('X-Proxy-Check', 'baseline')).body).toEqual({ ok: true });
});

it('solo sesión administrativa válida genera diagnóstico; IA continúa deshabilitada sin consultar negocio', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PROXY_DIAGNOSTICS', 'true');
  const log = vi.fn();
  vi.spyOn(diagnosticFiles, 'createPrivateDiagnosticLog').mockReturnValue(
    Object.assign(log, { flush: async () => {} }),
  );
  const store = { get: vi.fn(async () => Date.now() + 60000), set: vi.fn(), delete: vi.fn() };
  const read = vi.fn();
  const app = createApp(
    { hash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`, secret: 's'.repeat(64), store },
    { tokenHash: '', publicOrigin: '', trustedProxyIps: '', allowLocalHttp: false, read },
  );
  const anonymous = await request(app).get('/api/auth/session').set('X-Proxy-Check', 'baseline');
  expect(anonymous.body).toEqual({ authenticated: false, configured: true });
  expect(log).not.toHaveBeenCalled();
  const cookie = `__Host-prisma_admin=${randomBytes(32).toString('hex')}`;
  const authenticated = await request(app)
    .get('/api/auth/session')
    .set('Cookie', cookie)
    .set('X-Proxy-Check', 'baseline');
  expect(authenticated.body).toEqual({ authenticated: true, configured: true });
  expect(log).toHaveBeenCalledTimes(1);
  expect(authenticated.text).not.toMatch(/socket_peer|forwarded_proto|node_env|proxy_diagnostic/);
  expect(
    (
      await request(app)
        .get('/api/integrations/ai/monthly-context?period=2026-10')
        .set('Cookie', cookie)
        .set('X-Proxy-Check', 'baseline')
    ).status,
  ).toBe(503);
  expect(read).not.toHaveBeenCalled();
  expect(store.set).not.toHaveBeenCalled();
  expect(store.delete).not.toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain(cookie);
  expect((await request(app).get('/api/people')).status).toBe(401);
  expect((await request(app).post('/api/auth/session').set('Cookie', cookie)).status).toBe(404);
});
