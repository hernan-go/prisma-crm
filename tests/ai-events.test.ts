import { afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app';
import { pool } from '../server/db';
const token = 'e'.repeat(64);
const context = {
  version: '1.0' as const,
  period: { id: 1, year: 2026, month: 11, status: 'open' as const },
  as_of: '2026-11-05T12:00:00Z',
  time_axis: 'economic_period' as const,
  currency: 'ARS' as const,
  income: {
    workshops: '100.00',
    event_collections: '20.00',
    event_refunds: '5.00',
    events: '15.00',
    total: '115.00',
  },
  event_expenses: '2.00',
  commercial_gross: '15.00',
  commercial_pending: '5.00',
  commercial_result: '13.00',
  events: [],
  warnings: [],
};
const options = {
  tokenHash: createHash('sha256').update(token).digest('hex'),
  allowLocalHttp: true,
};
afterAll(() => pool.end());
it('API empresarial de Eventos usa credencial de lectura, valida query y excluye datos personales', async () => {
  let reads = 0;
  const app = createApp(
    {},
    {
      ...options,
      readEvents: async () => {
        reads++;
        return { ...context, person_id: 42, telefono: 'PRIVADO', notes: 'PRIVADO' };
      },
    },
  );
  const route = '/api/integrations/ai/events-context?period=2026-11';
  expect((await request(app).get(route)).status).toBe(401);
  expect(reads).toBe(0);
  expect(
    (
      await request(app)
        .get(route + '&person_id=1')
        .set('Authorization', 'Bearer ' + token)
    ).status,
  ).toBe(422);
  expect(reads).toBe(0);
  const response = await request(app)
    .get(route)
    .set('Authorization', 'Bearer ' + token);
  expect(response.status).toBe(200);
  expect(response.body.income.total).toBe('115.00');
  expect(JSON.stringify(response.body)).not.toMatch(/PRIVADO|person_id|telefono|notes/);
  expect(response.headers['cache-control']).toContain('no-store');
  expect(
    (
      await request(app)
        .post(route)
        .set('Authorization', 'Bearer ' + token)
        .send({})
    ).status,
  ).toBe(405);
});
it('errores empresariales no filtran consultas, credenciales ni datos privados', async () => {
  const app = createApp(
    {},
    {
      ...options,
      readEvents: async () => {
        throw Error('PRIVADO ' + token);
      },
    },
  );
  const response = await request(app)
    .get('/api/integrations/ai/events-context?period=2026-11')
    .set('Authorization', 'Bearer ' + token);
  expect(response.status).toBe(503);
  expect(JSON.stringify(response.body)).not.toMatch(/PRIVADO|eeeeeeee/);
});

it('contrato de eventos conserva numeración e historia mínima y filtra datos personales', async () => {
  const entry = {
    id: 7,
    event_number: 2,
    name: 'Evento QA',
    date: '2026-11-10',
    status: 'cancelled' as const,
    cancelled_at: '2026-11-05T12:00:00Z',
    cancelled_participants: 3,
    cancellation_reason: 'Cancelación',
    active_count: 0,
    registered_count: 3,
    withdrawn_count: 3,
    collections: '0.00',
    refunds: '0.00',
    effective_net: '0.00',
    direct_expenses: '0.00',
    commercial: null,
    wallets: {
      jesica: { cash: '0.00', transfer: '0.00', total: '0.00' },
      hernan: { cash: '0.00', transfer: '0.00', total: '0.00' },
    },
    participants: [{ nombre: 'PRIVADO' }],
    movements: [{ amount: '999' }],
  };
  const app = createApp(
    {},
    { ...options, readEvents: async () => ({ ...context, events: [entry] }) },
  );
  const response = await request(app)
    .get('/api/integrations/ai/events-context?period=2026-11')
    .set('Authorization', 'Bearer ' + token);
  expect(response.status).toBe(200);
  expect(response.body.events[0]).toMatchObject({
    event_number: 2,
    cancelled_participants: 3,
    commercial: null,
  });
  expect(JSON.stringify(response.body)).not.toMatch(/PRIVADO|movements|nombre/);
});

it('Eventos limita tamaño y no expone una respuesta empresarial excesiva', async () => {
  const app = createApp(
    {},
    { ...options, readEvents: async () => ({ ...context, warnings: ['x'.repeat(513 * 1024)] }) },
  );
  const response = await request(app)
    .get('/api/integrations/ai/events-context?period=2026-11')
    .set('Authorization', 'Bearer ' + token);
  expect(response.status).toBe(413);
  expect(response.body.code).toBe('context_too_large');
  expect(JSON.stringify(response.body).length).toBeLessThan(300);
});
