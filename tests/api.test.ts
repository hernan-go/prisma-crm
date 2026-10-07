import { testCredentials, memorySessions } from './auth-helper.js';
import { it, expect, describe, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
const credentials = await testCredentials();
const app = createApp({ ...credentials, store: memorySessions() });
const agent = request.agent(app);
await agent.post('/api/auth/login').send({ password: credentials.password });
afterAll(() => pool.end());
describe('API: validación y límites', () => {
  it('bloquea acceso hasta configurar autenticación', async () => {
    expect((await request(createApp({ hash: '', secret: '' })).get('/api/people')).status).toBe(
      503,
    );
  });
  it('rechaza persona incompleta antes de consultar DB', async () => {
    const r = await agent.post('/api/people').send({ nombre: 'Ana' });
    expect(r.status).toBe(422);
    expect(r.body.message).toBeTruthy();
  });
  it('rechaza período inválido', async () =>
    expect((await agent.post('/api/periods').send({ year: 2026, month: 13 })).status).toBe(422));
  it('rechaza modo inválido y selección arbitraria de fuente antes de consultar DB', async () => {
    for (const extra of [{ mode: 'invalid' }, { mode: 'clone_previous', source_period_id: 1 }])
      expect(
        (await agent.post('/api/periods').send({ year: 2045, month: 11, ...extra })).status,
      ).toBe(422);
  });
  it('bloquea escrituras desde otro origen', async () =>
    expect(
      (await agent.post('/api/people').set('Origin', 'https://evil.invalid').send({})).status,
    ).toBe(403));
  it('rechaza identificadores manipulados', async () =>
    expect((await agent.get('/api/people/1%20OR%201=1')).status).toBe(422));
  it('responde JSON en rutas API inexistentes', async () =>
    expect((await agent.get('/api/missing')).status).toBe(404));
  it('requiere revisión explícita al importar', async () =>
    expect(
      (
        await agent.post('/api/import/commit').send({
          rows: [
            {
              person: { nombre: 'Ana', apellido: 'Test', telefono: '3411234567' },
              action: 'create',
            },
          ],
        })
      ).status,
    ).toBe(422));
});
