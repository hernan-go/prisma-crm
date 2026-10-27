import { afterAll, afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
import { assembleMonthlyContext } from '../server/integrations/ai-context.js';
import type { AiIntegrationOptions } from '../server/integrations/ai-router.js';

const token = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const host = 'crm.example.invalid';
const url = '/api/integrations/ai/monthly-context?period=2026-10';
const sample = () =>
  assembleMonthlyContext(
    {
      period: { id: 1, year: 2026, month: 10, status: 'open' },
      members: [],
      fees: [],
      expenses: [],
    },
    0,
    [],
    [],
    [],
    '2026-10-27T12:00:00.000Z',
    [],
  );
const adminStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
afterAll(() => pool.end());

// Tests simulate SiteGround's absent peer at the server socket, never via a
// client header. This middleware exists only here; production has no such hook.
function harness(overrides: AiIntegrationOptions = {}, peer: string | undefined = undefined) {
  const read = overrides.read ?? vi.fn(async () => sample());
  const app = express();
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/integrations/ai/'))
      Object.defineProperty(req.socket, 'remoteAddress', { value: peer, configurable: true });
    next();
  });
  app.use(
    createApp(
      {
        hash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`,
        secret: 's'.repeat(64),
        store: adminStore,
      },
      {
        tokenHash,
        publicOrigin: `https://${host}`,
        trustedProxyIps: '',
        allowLocalHttp: false,
        transportMode: 'siteground_managed',
        ...overrides,
        read,
      },
    ),
  );
  const fetch = (method = 'get') => {
    const client = request(app);
    return client[method as 'get'](url)
      .set('Host', host)
      .set('X-Forwarded-Proto', 'https')
      .set('Authorization', `Bearer ${token}`);
  };
  return { app, read, fetch };
}

it('modo explícito de producción admite peer ausente, sin sesión ni cookies nuevas', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const { fetch, read } = harness();
  const response = await fetch();
  expect(response.status).toBe(200);
  expect(response.body).toEqual(sample());
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(read).toHaveBeenCalledWith('2026-10');
  expect(adminStore.get).not.toHaveBeenCalled();
});

it.each(['development', 'test', ''])(
  'modo administrado falla cerrado fuera de producción: %s',
  async (env) => {
    vi.stubEnv('NODE_ENV', env);
    const { fetch, read } = harness({ allowLocalHttp: true }, '127.0.0.1');
    expect((await fetch()).status).toBe(503);
    expect(read).not.toHaveBeenCalled();
  },
);

it.each([
  { publicOrigin: '' },
  { publicOrigin: `http://${host}` },
  { publicOrigin: `https://${host}/path` },
  { publicOrigin: `https://user:password@${host}` },
  { tokenHash: '' },
  { tokenHash: 'invalid' },
  { trustedProxyIps: '*' },
  { transportMode: '' },
  { transportMode: 'siteground' },
  { transportMode: 'true' },
])('configuración incompleta o inválida devuelve 503: %j', async (overrides) => {
  vi.stubEnv('NODE_ENV', 'production');
  const { fetch, read } = harness(overrides);
  expect((await fetch()).status).toBe(503);
  expect(read).not.toHaveBeenCalled();
});

it('sin modo explícito no autoriza peer ausente; el valor de entorno debe ser exacto', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('AI_READ_TRANSPORT_MODE', undefined);
  let h = harness({ transportMode: undefined });
  expect((await h.fetch()).status).toBe(403);
  expect(h.read).not.toHaveBeenCalled();
  vi.stubEnv('AI_READ_TRANSPORT_MODE', 'siteground_managed');
  h = harness({ transportMode: undefined });
  expect((await h.fetch()).status).toBe(200);
});

it.each(['203.0.113.99', '127.0.0.1', '::1', '', 'unknown', 'unavailable'])(
  'rechaza peer no autorizado o malformado aunque falsifique headers: %j',
  async (peer) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '1');
    const { fetch, read } = harness({ trustedProxyIps: '192.0.2.10' }, peer);
    const response = await fetch()
      .set('X-Forwarded-For', '192.0.2.10')
      .set('X-Real-IP', '192.0.2.10')
      .set('Passenger-Proto', 'https')
      .set('Forwarded', `for=192.0.2.10;proto=https;host=${host}`);
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  },
);

it.each(['192.0.2.10', '::ffff:192.0.2.10'])(
  'IP visible solo se admite si está expresamente autorizada: %s',
  async (peer) => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await harness({ trustedProxyIps: '192.0.2.10' }, peer).fetch()).status).toBe(200);
  },
);

it.each([undefined, '', 'http', 'HTTPS', 'https,http', 'http,https', 'https, https'])(
  'rechaza protocolo ausente o no exactamente https: %j',
  async (proto) => {
    vi.stubEnv('NODE_ENV', 'production');
    const { fetch, read } = harness();
    const req = fetch().set('Passenger-Proto', 'https');
    if (proto === undefined) req.unset('X-Forwarded-Proto');
    else req.set('X-Forwarded-Proto', proto);
    expect((await req).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  },
);

it.each(['evil.invalid', `${host}:443`, `${host}.evil.invalid`])(
  'Host debe ser exacto: %s',
  async (value) => {
    vi.stubEnv('NODE_ENV', 'production');
    const { fetch, read } = harness();
    expect((await fetch().set('Host', value).set('X-Forwarded-Host', host)).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  },
);

it.each([undefined, 'Bearer invalid', `Bearer ${'0'.repeat(64)}`])(
  'peer ausente y XFP no sustituyen credencial: %s',
  async (auth) => {
    vi.stubEnv('NODE_ENV', 'production');
    const { fetch, read } = harness();
    const req = fetch();
    if (auth === undefined) req.unset('Authorization');
    else req.set('Authorization', auth);
    expect((await req).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  },
);

it.each([
  ['Origin', `https://${host}`],
  ['Origin', ''],
  ['Sec-Fetch-Site', 'same-origin'],
  ['Sec-Fetch-Mode', 'cors'],
  ['Sec-Fetch-Dest', 'empty'],
  ['Sec-Fetch-User', '?1'],
  ['Cookie', 'session=private'],
  ['Referer', `https://${host}/`],
])('rechaza indicios de navegador incluso con token: %s', async (header, value) => {
  vi.stubEnv('NODE_ENV', 'production');
  const { fetch, read } = harness();
  const response = await fetch().set(header, value);
  expect(response.status).toBe(403);
  expect(response.body.code).toBe('service_only');
  expect(read).not.toHaveBeenCalled();
});

it.each(['post', 'put', 'patch', 'delete', 'head', 'options'])(
  'rechaza método %s sin lectura',
  async (method) => {
    vi.stubEnv('NODE_ENV', 'production');
    const { fetch, read } = harness();
    const response = await fetch(method);
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET');
    expect(read).not.toHaveBeenCalled();
  },
);

it('no hay modo alternativo automático ni confianza en req.secure para un peer visible', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('TRUST_PROXY', '1');
  const { app, read } = harness();
  // A real public TCP request has a peer: without the test-only simulation it
  // remains rejected even with the mode enabled and a valid service token.
  const direct = createApp(
    {},
    { tokenHash, publicOrigin: `https://${host}`, transportMode: 'siteground_managed', read },
  );
  expect(
    (
      await request(direct)
        .get(url)
        .set('Host', host)
        .set('X-Forwarded-Proto', 'https')
        .set('Authorization', `Bearer ${token}`)
    ).status,
  ).toBe(403);
  expect(
    (await request(app).get('/api/people').set('Authorization', `Bearer ${token}`)).status,
  ).toBe(401);
  expect(read).not.toHaveBeenCalled();
});

it('errores no filtran token, negocio o detalles internos ni generan logs', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { fetch } = harness({ read: vi.fn().mockRejectedValue(new Error(`SQL private ${token}`)) });
  const response = await fetch();
  expect(response.status).toBe(503);
  expect(response.text).not.toMatch(/SQL|private/);
  expect(response.text).not.toContain(token);
  expect(info).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it('modo administrado conserva límites de ingreso y consultas sin confiar en XFF', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const authorized = harness();
  for (let i = 0; i < 30; i++)
    expect((await authorized.fetch().set('X-Forwarded-For', `192.0.2.${i}`)).status).toBe(200);
  expect((await authorized.fetch()).status).toBe(429);
  expect(authorized.read).toHaveBeenCalledTimes(30);
  const anonymous = harness();
  for (let i = 0; i < 120; i++)
    expect((await anonymous.fetch().unset('Authorization')).status).toBe(401);
  expect((await anonymous.fetch().unset('Authorization')).status).toBe(429);
  expect(anonymous.read).not.toHaveBeenCalled();
});

it('modo administrado conserva dos lecturas simultáneas y libera capacidad', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  let release!: () => void;
  let ready!: () => void;
  let started = 0;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bothStarted = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const read = vi.fn(async () => {
    if (++started === 2) ready();
    await blocked;
    return sample();
  });
  const { fetch } = harness({ read });
  const first = fetch().then((r) => r);
  const second = fetch().then((r) => r);
  await bothStarted;
  try {
    const busy = await fetch();
    expect(busy.status).toBe(503);
    expect(busy.body.code).toBe('busy');
  } finally {
    release();
    expect((await Promise.all([first, second])).map((r) => r.status)).toEqual([200, 200]);
  }
  expect((await fetch()).status).toBe(200);
});

it('modo administrado conserva límite de tamaño sin entregar respuesta parcial', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const data = sample();
  data.offered_schedules = Array.from({ length: 2000 }, (_, i) => ({
    schedule_id: i + 1,
    activity_id: 10,
    activity: 'á'.repeat(180),
    mode: 'group',
    day: 1,
    start: '09:00',
    end: '10:00',
  }));
  const response = await harness({ read: vi.fn(async () => data) }).fetch();
  expect(response.status).toBe(413);
  expect(response.body.code).toBe('context_too_large');
  expect(response.body.offered_schedules).toBeUndefined();
});

it('modo administrado conserva validación de consulta/cuerpo y aislamiento de rutas', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const h = harness();
  expect((await h.fetch().send({ sql: 'SELECT' })).status).toBe(422);
  const response = await request(h.app)
    .get('/api/integrations/ai/people')
    .set('Host', host)
    .set('X-Forwarded-Proto', 'https')
    .set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(404);
  expect(h.read).not.toHaveBeenCalled();
});
