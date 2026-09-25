import { it, expect, describe, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
const app = createApp();
afterAll(() => pool.end());
describe('API: validación y límites', () => {
  it('bloquea producción hasta confirmar protección externa', async () => {
    const old = process.env.NODE_ENV,
      protection = process.env.EXTERNAL_PROTECTION_CONFIRMED;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.EXTERNAL_PROTECTION_CONFIRMED;
      expect((await request(app).get('/api/people')).status).toBe(503);
    } finally {
      if (old === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = old;
      if (protection === undefined) delete process.env.EXTERNAL_PROTECTION_CONFIRMED;
      else process.env.EXTERNAL_PROTECTION_CONFIRMED = protection;
    }
  });
  it('rechaza persona incompleta antes de consultar DB', async () => {
    const r = await request(app).post('/api/people').send({ nombre: 'Ana' });
    expect(r.status).toBe(422);
    expect(r.body.message).toBeTruthy();
  });
  it('rechaza período inválido', async () =>
    expect((await request(app).post('/api/periods').send({ year: 2026, month: 13 })).status).toBe(
      422,
    ));
  it('bloquea escrituras desde otro origen', async () =>
    expect(
      (await request(app).post('/api/people').set('Origin', 'https://evil.invalid').send({}))
        .status,
    ).toBe(403));
  it('rechaza identificadores manipulados', async () =>
    expect((await request(app).get('/api/people/1%20OR%201=1')).status).toBe(422));
  it('responde JSON en rutas API inexistentes', async () =>
    expect((await request(app).get('/api/missing')).status).toBe(404));
  it('requiere revisión explícita al importar', async () =>
    expect(
      (
        await request(app)
          .post('/api/import/commit')
          .send({
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
