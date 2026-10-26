import { afterAll, afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
import { AppError } from '../server/errors.js';
import {
  assembleMonthlyContext as buildContext,
  monthlyContext,
  readMonthlyContext,
} from '../server/integrations/ai-context.js';
import type { AiIntegrationOptions } from '../server/integrations/ai-router.js';
import { calculateSummary } from '../server/statistics/engine.js';
import { monthlyContextSchema } from '../shared/ai-context.js';
import { validateAiContextReadOnly } from '../scripts/validate-ai-context-readonly.js';

const at = '2026-10-25T15:00:00.000Z';
const period = { id: 1, year: 2026, month: 10, status: 'open' as const };
const row = (due: string | null = '100.10', paid = '40.05', id: number | null = 1) => ({
  account_id: id,
  amount_due: due,
  paid,
  payment_count: paid === '0.00' ? 0 : 2,
});
const group = (due: string | null = '100.10', paid = '40.05') =>
  Array.from({ length: 5 }, (_, i) => row(due, paid, i + 1));
function fixture() {
  return {
    period,
    members: group(),
    fees: group('50.00', '20.00').map((r, i) => ({
      ...r,
      instructor_id: i + 1,
      offering_id: 1,
      activity_id: 10,
      activity: 'Yoga',
      professional: 'Profesional operativo',
    })),
    expenses: Array.from({ length: 5 }, () => ({ amount: '10.00' })),
  };
}
const activities = [
  { activity_id: 10, name: 'Yoga', enrollments: 5, weekly_slots: 10 },
  { activity_id: 11, name: 'Movimiento', enrollments: 5, weekly_slots: 5 },
];
const categories = [
  {
    category_id: 1,
    category_name: 'Alquiler',
    recurring_concept: 'Alquiler',
    controlled_concept: 'Alquiler',
    kind: 'recurring' as const,
    amount: '50.00',
    movement_count: 5,
  },
];
const sample = () => assembleMonthlyContext(fixture(), 5, activities, [], categories, at);
const token = randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
const admin = {
  hash: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`,
  secret: 's'.repeat(64),
  store: {
    async get() {
      return Date.now() + 60000;
    },
    async set() {},
    async delete() {},
  },
};
const options = (overrides: AiIntegrationOptions = {}): AiIntegrationOptions => ({
  tokenHash,
  allowLocalHttp: true,
  trustedProxyIps: '',
  publicOrigin: '',
  read: vi.fn(async () => sample()),
  ...overrides,
});
const url = '/api/integrations/ai/monthly-context?period=2026-10';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => pool.end());

function assembleMonthlyContext(
  input: Parameters<typeof buildContext>[0],
  enrolled: number,
  acts: Parameters<typeof buildContext>[2],
  schedules: Parameters<typeof buildContext>[3],
  cats: Parameters<typeof buildContext>[4],
  asOf: string,
) {
  const combinations = enrolled
    ? [
        {
          activity_ids: acts.filter((a) => a.enrollments > 0).map((a) => a.activity_id),
          people: enrolled,
          enrollments: acts.reduce((n, a) => n + a.enrollments, 0),
          weekly_slots: acts.reduce((n, a) => n + a.weekly_slots, 0),
        },
      ]
    : [];
  return buildContext(input, enrolled, acts, schedules, cats, asOf, combinations);
}

it('distingue personas, inscripciones y plazas; incluye combinaciones completas', () => {
  const result = sample();
  expect(result.version).toBe('2.0');
  expect(result.people.data).toEqual({ members: 5, enrolled: 5, without_enrollment: 0 });
  expect(result.contracting.data).toMatchObject({ enrollments: 10, weekly_slots: 15 });
  expect(result.combinations.data).toEqual([
    { activity_ids: [10, 11], people: 5, enrollments: 10, weekly_slots: 15 },
  ]);
});

it('publica una persona, una actividad, un honorario y un gasto sin umbral', () => {
  const input = fixture();
  input.members = [row()];
  input.fees = input.fees.slice(0, 1);
  input.expenses = [{ amount: '10.00' }];
  const result = assembleMonthlyContext(
    input,
    1,
    [{ ...activities[0], enrollments: 1, weekly_slots: 2 }],
    [],
    [{ ...categories[0], amount: '10.00', movement_count: 1 }],
    at,
  );
  expect(result.people.data.enrolled).toBe(1);
  expect(result.contracting.data.activities[0].enrollments).toBe(1);
  expect(result.collections.data.due.value).toBe('100.10');
  expect(result.fees.data.committed.value).toBe('50.00');
  expect(result.fees.data.agreements[0]).toMatchObject({
    activity: 'Yoga',
    professional: 'Profesional operativo',
    amount_due: '50.00',
    paid: '20.00',
    pending: '30.00',
  });
  expect(result.expenses.data.categories[0]).toMatchObject({
    category_name: 'Alquiler',
    controlled_concept: 'Alquiler',
    amount: '10.00',
  });
  expect(result.combinations.data[0].people).toBe(1);
  expect(JSON.stringify(result)).not.toMatch(/suppressed|minimum_group/);
});

it('conserva complementos pequeños, créditos y todas las categorías', () => {
  const input = fixture();
  input.members = [...group(), row('100.10', '200.00')];
  const result = assembleMonthlyContext(
    input,
    5,
    activities,
    [],
    [
      { ...categories[0], amount: '10.00', movement_count: 1 },
      {
        ...categories[0],
        category_id: 2,
        category_name: 'Luz',
        amount: '40.00',
        movement_count: 4,
      },
    ],
    at,
  );
  expect(result.people.data.without_enrollment).toBe(1);
  expect(result.collections.data.credit.value).toBe('99.90');
  expect(result.expenses.data.categories).toHaveLength(2);
});

it('concilia exactamente con el motor estadístico sin duplicar honorarios', () => {
  const input = fixture(),
    result = sample(),
    summary = calculateSummary(input, at);
  expect(result.collections.data.due).toEqual(summary.metrics.due);
  expect(result.collections.data.collected.value).toBe('200.25');
  expect(result.collections.data.debt.value).toBe('300.25');
  expect(result.collections.data.applied_known).toBe('200.25');
  expect(result.fees.data.committed).toEqual(summary.metrics.fees_committed);
  expect(result.expenses.data.registered.value).toBe('50.00');
  expect(result.fees.data.agreements.reduce((n, a) => n + Number(a.amount_due), 0)).toBe(250);
});

it('distingue cero, NULL, cuenta ausente y falta de movimientos aun con un único caso', () => {
  const input = fixture();
  input.members = [row('0.00', '0.00'), row(null, '0.00'), row(null, '0.00', null)];
  expect(assembleMonthlyContext(input, 0, [], [], categories, at).collections.data).toMatchObject({
    due: { value: '0.00', coverage: 'partial', defined: 1, undefined: 1, missing: 1 },
    covered_percentage: null,
  });
  input.members = [row(null, '0.00')];
  expect(
    assembleMonthlyContext(input, 0, [], [], categories, at).collections.data.due.coverage,
  ).toBe('undefined');
  input.members = [];
  expect(
    assembleMonthlyContext(input, 0, [], [], categories, at).collections.data.due.coverage,
  ).toBe('empty');
});

it('no compensa deuda con crédito y separa cobros indefinidos', () => {
  const input = fixture();
  input.members = [row('100.00', '50.00'), row('20.00', '30.00'), row(null, '10.00')];
  expect(assembleMonthlyContext(input, 0, [], [], categories, at).collections.data).toMatchObject({
    due: { value: '120.00' },
    collected: { value: '90.00' },
    debt: { value: '50.00' },
    credit: { value: '10.00' },
    applied_known: '70.00',
    collected_undefined: '10.00',
  });
});

it('conserva un acuerdo indefinido y un exceso de pago sin inventar crédito de facilitador', () => {
  const input = fixture();
  input.fees = [
    { ...input.fees[0], amount_due: '50.00', paid: '60.00' },
    { ...input.fees[1], amount_due: null, paid: '0.00' },
  ];
  const fees = assembleMonthlyContext(input, 5, activities, [], categories, at).fees.data;
  expect(fees).toMatchObject({
    committed: { value: '50.00', undefined: 1 },
    overpaid_count: 1,
    overpaid_excess: '10.00',
  });
  expect(fees.agreements[1]).toMatchObject({ amount_due: null, pending: null, excess: null });
});

it('excluye datos personales y textos libres incluso cuando se inyectan en filas internas', () => {
  const input = fixture();
  const privateFields = {
    person_id: 889,
    nombre: 'NOMBRE_PRIVADO',
    dni: 'DNI_PRIVADO',
    email: 'EMAIL_PRIVADO',
    notes: 'NOTAS_PRIVADAS',
    telefono: 'TELEFONO_PRIVADO',
    address: 'DOMICILIO_PRIVADO',
    emergency_phone: 'EMERGENCIA_PRIVADA',
    health_notes: 'SALUD_PRIVADA',
  };
  Object.assign(input.members[0], privateFields);
  Object.assign(input.fees[0], privateFields);
  const result = assembleMonthlyContext(
    input,
    5,
    activities.map((a) => ({ ...a, ...privateFields })),
    [],
    categories.map((c) => ({ ...c, concept: 'CONCEPTO_LIBRE_PRIVADO', ...privateFields })),
    at,
  );
  const json = JSON.stringify(result);
  for (const value of Object.values(privateFields)) expect(json).not.toContain(String(value));
  expect(json).not.toMatch(/CONCEPTO_LIBRE_PRIVADO|account_id|person_id/);
  expect(monthlyContextSchema.safeParse(result).success).toBe(true);
});

it('rechaza combinaciones o gastos que no concilian', () => {
  expect(() => buildContext(fixture(), 5, activities, [], categories, at, [])).toThrow(
    'Inconsistent combinations',
  );
  expect(() => assembleMonthlyContext(fixture(), 5, activities, [], [], at)).toThrow(
    'Inconsistent expense',
  );
});

it('conserva rankings con empates y actividades sin contratación', () => {
  expect(
    assembleMonthlyContext(
      fixture(),
      5,
      [...activities, { activity_id: 12, name: 'Otra', enrollments: 0, weekly_slots: 0 }],
      [],
      categories,
      at,
    ).contracting.data,
  ).toMatchObject({ highest_activity_ids: [10, 11], lowest_activity_ids: [12] });
});

it('continuidad explicita ausencia del mes anterior y no inventa bajas', () => {
  expect(sample().continuity).toEqual({
    status: 'unavailable',
    data: null,
    reason: 'previous_calendar_period_missing',
  });
  const result = buildContext(
    fixture(),
    5,
    activities,
    [],
    categories,
    at,
    sample().combinations.data,
    {
      status: 'available',
      data: {
        previous_period: { ...period, id: 2, month: 9 },
        previously_enrolled: 3,
        currently_enrolled: 5,
        retained: 2,
        new_in_pair: 3,
        without_current_enrollment: 1,
      },
    },
  );
  expect(result.continuity).toMatchObject({
    data: { retained: 2, new_in_pair: 3, without_current_enrollment: 1 },
  });
});

it.each([
  { enabled: 'false', database: 'prisma_test', host: '127.0.0.1' },
  { enabled: 'true', database: 'prisma_dev', host: '127.0.0.1' },
  { enabled: 'true', database: 'prisma_test', host: 'remote.invalid' },
])(
  'el validador real rechaza destinos no autorizados antes de conectar: %j',
  async ({ enabled, database, host }) => {
    vi.stubEnv('RUN_AI_READ_DB_TESTS', enabled);
    vi.stubEnv('DB_NAME', database);
    vi.stubEnv('DB_HOST', host);
    const connect = vi.spyOn(pool, 'getConnection');
    await expect(validateAiContextReadOnly()).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  },
);
it('credencial de servicio válida accede sin sesión; no se expide cookie', async () => {
  const opts = options();
  const response = await request(createApp(admin, opts))
    .get(url)
    .set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.body).toEqual(sample());
  expect(opts.read).toHaveBeenCalledWith('2026-10');
});

it.each([undefined, 'Bearer invalid', `Bearer ${'0'.repeat(64)}`])(
  'rechaza credencial ausente/incorrecta: %s',
  async (authorization) => {
    const opts = options();
    const req = request(createApp(admin, opts)).get(url);
    if (authorization) req.set('Authorization', authorization);
    expect((await req).status).toBe(401);
    expect(opts.read).not.toHaveBeenCalled();
  },
);

it('cookie administrativa no sustituye al token y token no habilita API administrativa', async () => {
  const app = createApp(admin, options());
  expect(
    (
      await request(app)
        .get(url)
        .set('Cookie', `prisma_admin=${'a'.repeat(64)}`)
    ).status,
  ).toBe(401);
  expect(
    (await request(app).get('/api/people').set('Authorization', `Bearer ${token}`)).status,
  ).toBe(401);
});

it.each(['', 'invalid'])('falla cerrada ante hash de configuración inválido: %s', async (hash) => {
  expect(
    (
      await request(createApp(admin, options({ tokenHash: hash })))
        .get(url)
        .set('Authorization', `Bearer ${token}`)
    ).status,
  ).toBe(503);
});

it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])(
  'rechaza %s sin invocar lectura ni escrituras',
  async (method) => {
    const opts = options();
    const client = request(createApp(admin, opts));
    const send = method.toLowerCase() as 'post';
    const response = await client[send](url).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET');
    expect(opts.read).not.toHaveBeenCalled();
  },
);

it.each([
  'period=2019-10',
  'period=2026-13',
  'period=2026-1',
  'period=2026-10&period=2026-11',
  'period=2026-10&person_id=1',
  'period=2026-10&sql=DELETE',
  '',
])('valida únicamente período mensual: %s', async (query) => {
  const opts = options();
  expect(
    (
      await request(createApp(admin, opts))
        .get(`/api/integrations/ai/monthly-context?${query}`)
        .set('Authorization', `Bearer ${token}`)
    ).status,
  ).toBe(422);
  expect(opts.read).not.toHaveBeenCalled();
});

it('período inexistente devuelve 404 y errores internos no revelan SQL o secretos', async () => {
  const opts = options({ read: vi.fn().mockRejectedValue(new AppError(404, 'private')) });
  expect(
    (await request(createApp(admin, opts)).get(url).set('Authorization', `Bearer ${token}`)).status,
  ).toBe(404);
  opts.read = vi.fn().mockRejectedValue(new Error(`SELECT sensitive ${token}`));
  const response = await request(createApp(admin, opts))
    .get(url)
    .set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(503);
  expect(response.text).not.toMatch(/SELECT|sensitive/);
  expect(response.text).not.toContain(token);
});

it('HTTP en producción se rechaza incluso con excepción local y cabecera HTTPS falsificada', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const app = createApp(admin, options({ publicOrigin: 'https://crm.example.invalid' }));
  expect(
    (
      await request(app)
        .get(url)
        .set('Host', 'crm.example.invalid')
        .set('X-Forwarded-Proto', 'https')
        .set('Authorization', `Bearer ${token}`)
    ).status,
  ).toBe(403);
});

it('proxy exacto autorizado admite HTTPS; rechaza host ajeno y cadena de protocolos', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  const app = createApp(
    admin,
    options({ publicOrigin: 'https://crm.example.invalid', trustedProxyIps: '127.0.0.1' }),
  );
  const fetch = (host: string, proto: string) =>
    request(app)
      .get(url)
      .set('Host', host)
      .set('X-Forwarded-Proto', proto)
      .set('Authorization', `Bearer ${token}`);
  expect((await fetch('crm.example.invalid', 'https')).status).toBe(200);
  expect((await fetch('wrong.invalid', 'https')).status).toBe(403);
  expect((await fetch('crm.example.invalid', 'https,http')).status).toBe(403);
});

it('sin origen HTTPS o con proxy inválido falla cerrada en producción', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect((await request(createApp(admin, options())).get(url)).status).toBe(503);
  expect(
    (
      await request(
        createApp(
          admin,
          options({ publicOrigin: 'https://crm.example.invalid', trustedProxyIps: '*' }),
        ),
      ).get(url)
    ).status,
  ).toBe(503);
});

it('rechaza origen de navegador y ruta desconocida no cae a rutas administrativas', async () => {
  const app = createApp(admin, options());
  expect(
    (
      await request(app)
        .get(url)
        .set('Authorization', `Bearer ${token}`)
        .set('Origin', 'https://evil.invalid')
    ).status,
  ).toBe(403);
  expect(
    (await request(app).get('/api/integrations/ai/people').set('Authorization', `Bearer ${token}`))
      .status,
  ).toBe(404);
});

it('limita consultas autorizadas sin depender de IP reenviada', async () => {
  const opts = options();
  const app = createApp(admin, opts);
  for (let i = 0; i < 30; i++)
    expect(
      (
        await request(app)
          .get(url)
          .set('Authorization', `Bearer ${token}`)
          .set('X-Forwarded-For', `192.0.2.${i}`)
      ).status,
    ).toBe(200);
  expect((await request(app).get(url).set('Authorization', `Bearer ${token}`)).status).toBe(429);
  expect(opts.read).toHaveBeenCalledTimes(30);
});

it('limita intentos sin credenciales antes de tocar el lector', async () => {
  const opts = options();
  const app = createApp(admin, opts);
  for (let i = 0; i < 120; i++) expect((await request(app).get(url)).status).toBe(401);
  expect((await request(app).get(url)).status).toBe(429);
  expect(opts.read).not.toHaveBeenCalled();
});

it('rechaza cuerpo GET y oculta errores de validación del contrato de salida', async () => {
  const opts = options();
  const app = createApp(admin, opts);
  expect(
    (await request(app).get(url).set('Authorization', `Bearer ${token}`).send({ sql: 'SELECT' }))
      .status,
  ).toBe(422);
  expect(opts.read).not.toHaveBeenCalled();
  opts.read = vi.fn().mockResolvedValue({ secret: token });
  const response = await request(createApp(admin, opts))
    .get(url)
    .set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(503);
  expect(response.text).not.toContain(token);
});

it('acota respuestas sin entregar un JSON truncado o parcial', async () => {
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
  const response = await request(createApp(admin, options({ read: vi.fn(async () => data) })))
    .get(url)
    .set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(413);
  expect(response.body.code).toBe('context_too_large');
});

it('limita concurrencia y libera capacidad al terminar', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  let ready!: () => void;
  const bothStarted = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const read = vi.fn(async () => {
    started++;
    if (started === 2) ready();
    await blocked;
    return sample();
  });
  const app = createApp(admin, options({ read }));
  const fetch = () =>
    request(app)
      .get(url)
      .set('Authorization', `Bearer ${token}`)
      .then((r) => r);
  const first = fetch(),
    second = fetch();
  await bothStarted;
  try {
    expect((await fetch()).status).toBe(503);
  } finally {
    release();
    const completed = await Promise.all([first, second]);
    expect(completed.map((r) => r.status)).toEqual([200, 200]);
  }
  expect((await fetch()).status).toBe(200);
});

it('commit de lectura exitosa y liberación, sin usar escrituras del pool', async () => {
  const input = fixture();
  const rows: unknown[][] = [
    [{ id: 1 }],
    [period],
    input.members,
    input.fees,
    input.expenses,
    [{ enrolled: 5 }],
    activities,
    [],
    categories,
    [
      {
        activity_key: '10,11',
        expected_key_length: 5,
        people: 5,
        enrollments: 10,
        weekly_slots: 15,
      },
    ],
    [],
  ];
  const db = {
    query: vi.fn(async () => []),
    execute: vi.fn(async () => [rows.shift(), []]),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  vi.spyOn(pool, 'getConnection').mockResolvedValue(db as any);
  expect((await monthlyContext('2026-10')).collections).toEqual(sample().collections);
  expect(db.commit).toHaveBeenCalledTimes(1);
  expect(db.rollback).not.toHaveBeenCalled();
  expect(db.release).toHaveBeenCalledTimes(1);
  expect(rows).toHaveLength(0);
});

it('lector SQL parametriza mes, usa período económico y solo selecciona columnas permitidas', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = {
    execute: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.includes('id,year,month,status FROM periods WHERE year=')) return [[], []];
      if (sql.includes('WHERE year=?')) return [[{ id: 1 }], []];
      if (sql.includes('activity_key,MAX'))
        return [
          [
            {
              activity_key: '10,11',
              expected_key_length: 5,
              people: 5,
              enrollments: 10,
              weekly_slots: 15,
            },
          ],
          [],
        ];
      if (sql.includes('id,year,month,status')) return [[period], []];
      if (sql.includes('FROM period_memberships m')) return [fixture().members, []];
      if (sql.includes('SELECT pairs.instructor_id')) return [fixture().fees, []];
      if (sql.includes('SELECT e.amount')) return [fixture().expenses, []];
      if (sql.includes('COUNT(DISTINCT person_id)')) return [[{ enrolled: 5 }], []];
      if (sql.includes('COUNT(e.id)')) return [activities, []];
      if (sql.includes('s.id schedule_id')) return [[], []];
      if (sql.includes('c.id category_id')) return [categories, []];
      throw Error('Unexpected SQL');
    }),
  };
  const result = await readMonthlyContext('2026-10', db as any, at);
  expect(result).toEqual(sample());
  expect(calls[0].values).toEqual([2026, 10]);
  expect(calls.every((c) => /^\s*SELECT\b/.test(c.sql))).toBe(true);
  expect(calls.map((c) => c.sql).join('\n')).not.toMatch(
    /SELECT \*|p\.date|nombre|telefono|email|notes/,
  );
  expect(calls.filter((c) => c.sql.includes('WHERE a.period_id=?'))).not.toHaveLength(0);
});

it('período ausente en SQL no crea nada', async () => {
  const db = { execute: vi.fn(async () => [[], []]) };
  await expect(readMonthlyContext('2026-11', db as any, at)).rejects.toMatchObject({ status: 404 });
  expect(db.execute).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  'transacción READ ONLY consistente, liberación y rollback ante error=%s',
  async (fail) => {
    const db = {
      query: vi.fn(async () => []),
      execute: vi.fn(async () => {
        if (fail) throw Error('SQL failure');
        return [[], []];
      }),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    vi.spyOn(pool, 'getConnection').mockResolvedValue(db as any);
    await expect(monthlyContext('2026-10')).rejects.toThrow();
    expect(db.query.mock.calls).toEqual([
      ['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'],
      ['START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY'],
    ]);
    expect(db.commit).not.toHaveBeenCalled();
    expect(db.rollback).toHaveBeenCalledTimes(1);
    expect(db.release).toHaveBeenCalledTimes(1);
  },
);
