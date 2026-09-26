import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../server/app.js';
import { pool, query, execute } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { seed } from '../server/seed.js';
const enabled = process.env.RUN_DB_TESTS === 'true';
const app = createApp();
describe.skipIf(!enabled)('Integración MySQL real: recorrido completo', () => {
  let pid: number, period: number, activity: number, enrollment: number, payment: number;
  const person = { nombre: 'Persona Ficticia', apellido: 'Prueba QA', telefono: '0000001234' };
  beforeAll(async () => {
    if (process.env.DB_NAME !== 'prisma_test')
      throw new Error('Las pruebas requieren DB_NAME=prisma_test.');
    await migrate();
    for (const table of [
      'payments',
      'monthly_accounts',
      'enrollment_slots',
      'enrollments',
      'activity_allowed_days',
      'activities',
      'instructors',
      'periods',
      'people',
      'advertising_investments',
    ])
      await execute(`DELETE FROM ${table}`);
    await seed();
  }, 30000);
  afterAll(() => pool.end());
  it('crea persona, valida duplicado y edita contacto', async () => {
    let r = await request(app).post('/api/people').send(person);
    expect(r.status).toBe(201);
    pid = r.body.id;
    expect((await request(app).post('/api/people').send(person)).status).toBe(409);
    r = await request(app)
      .put(`/api/people/${pid}`)
      .send({ ...person, emergency_name: 'Contacto ficticio', emergency_phone: '0000001235' });
    expect(r.status).toBe(200);
    expect((await request(app).get(`/api/people/${pid}`)).body.emergency_phone).toBe('0000001235');
  });
  it('crea octubre vacío y rechaza período duplicado', async () => {
    const r = await request(app).post('/api/periods').send({ year: 2026, month: 10 });
    expect(r.status).toBe(201);
    period = r.body.id;
    expect((await request(app).get(`/api/enrollments?period_id=${period}`)).body).toEqual([]);
    expect((await request(app).post('/api/periods').send({ year: 2026, month: 10 })).status).toBe(
      409,
    );
  });
  it('inscribe dos actividades y múltiples slots, bloquea día inválido', async () => {
    const list = (await request(app).get('/api/activities')).body;
    activity = list.find((a: any) => a.name.startsWith('Taller de la Memoria')).id;
    let r = await request(app)
      .post('/api/enrollments')
      .send({
        person_id: pid,
        period_id: period,
        activity_id: activity,
        slots: [{ day: 1, start: '10:00', end: '12:00' }],
      });
    expect(r.status).toBe(422);
    r = await request(app)
      .post('/api/enrollments')
      .send({
        person_id: pid,
        period_id: period,
        activity_id: activity,
        slots: [
          { day: 2, start: '10:00', end: '12:00' },
          { day: 4, start: '15:00', end: '17:00' },
        ],
      });
    expect(r.status).toBe(201);
    enrollment = r.body.id;
    r = await request(app)
      .post('/api/enrollments')
      .send({
        person_id: pid,
        period_id: period,
        activity_id: list.find((a: any) => a.name.startsWith('Yoga')).id,
        slots: [{ day: 1, start: '11:00', end: '12:00' }],
      });
    expect(r.status).toBe(201);
    const es = (await request(app).get(`/api/enrollments?period_id=${period}`)).body;
    expect(es).toHaveLength(2);
    expect(es.find((e: any) => e.id === enrollment).slots).toHaveLength(2);
  });
  it('calcula importe indefinido, dos carteras y deuda', async () => {
    expect(
      (await request(app).get(`/api/accounts?period_id=${period}`)).body[0].balance,
    ).toBeNull();
    expect(
      (
        await request(app)
          .put('/api/accounts')
          .send({ person_id: pid, period_id: period, amount_due: '60000' })
      ).status,
    ).toBe(200);
    for (const method of ['transfer', 'cash']) {
      const r = await request(app)
        .post('/api/payments')
        .send({ person_id: pid, period_id: period, date: '2026-10-01', amount: '20000', method });
      expect(r.status).toBe(201);
      payment = r.body.id;
    }
    const d = (await request(app).get(`/api/dashboard?period_id=${period}`)).body;
    expect(d).toMatchObject({
      people: 1,
      enrollments: 2,
      paid: '40000.00',
      cash: '20000.00',
      transfer: '20000.00',
      pending: '20000.00',
    });
  });
  it('busca, edita monto, muestra sobrepago y elimina pago', async () => {
    expect((await request(app).get('/api/people?q=Ficticia')).body.total).toBe(1);
    expect((await request(app).get('/api/people?q=0000001234')).body.total).toBe(1);
    expect(
      (
        await request(app).put(`/api/payments/${payment}`).send({
          person_id: pid,
          period_id: period,
          date: '2026-10-01',
          amount: '50000',
          method: 'cash',
        })
      ).status,
    ).toBe(200);
    expect((await request(app).get(`/api/accounts?period_id=${period}`)).body[0].balance).toBe(
      '-10000.00',
    );
    expect((await request(app).delete(`/api/payments/${payment}`)).status).toBe(200);
    expect((await request(app).get(`/api/accounts?period_id=${period}`)).body[0].balance).toBe(
      '40000.00',
    );
  });
  it('edita horarios y preserva persona al cancelar inscripción', async () => {
    expect(
      (
        await request(app)
          .put(`/api/enrollments/${enrollment}`)
          .send({
            person_id: pid,
            period_id: period,
            activity_id: activity,
            slots: [{ day: 3, start: '19:00', end: '20:00' }],
          })
      ).status,
    ).toBe(200);
    expect((await request(app).delete(`/api/enrollments/${enrollment}`)).status).toBe(200);
    expect((await request(app).get(`/api/people/${pid}`)).status).toBe(200);
  });
  it('importa XLSX y rechaza duplicados en la misma transacción sin cambios parciales', async () => {
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet('Personas');
    s.addRow(['Nombre y apellido', 'Teléfono']);
    s.addRow(['Importación Ficticia', '0000005678']);
    const r = await request(app)
      .post('/api/import/preview')
      .attach('file', Buffer.from(await w.xlsx.writeBuffer()), 'prueba.xlsx');
    expect(r.status).toBe(200);
    expect(r.body.rows[0].review).toBe(true);
    const person = r.body.rows[0].person;
    const row = { person, action: 'create', reviewed: true };
    expect(
      (
        await request(app)
          .post('/api/import/commit')
          .send({ rows: [row, row] })
      ).status,
    ).toBe(409);
    expect((await request(app).get('/api/people?q=0000005678')).body.total).toBe(0);
    expect(
      (
        await request(app)
          .post('/api/import/commit')
          .send({ rows: [row] })
      ).body.created,
    ).toBe(1);
  });
  it('omite incompletos y conserva contacto al actualizar desde importación', async () => {
    const response = await request(app)
      .post('/api/import/commit')
      .send({
        rows: [
          { person: { nombre: 'Incompleta' }, action: 'skip', reviewed: true },
          { person, action: 'update', target_id: pid, reviewed: true },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ skipped: 1, updated: 1 });
    expect((await request(app).get(`/api/people/${pid}`)).body.emergency_phone).toBe('0000001235');
  });
  it('serializa altas simultáneas que comparten teléfono', async () => {
    const data = { nombre: 'Concurrencia', apellido: 'Ficticia', telefono: '0000019191' };
    const results = await Promise.all([
      request(app).post('/api/people').send(data),
      request(app).post('/api/people').send(data),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('publicidad CRUD separada de cobranzas y configuración editable', async () => {
    let r = await request(app)
      .post('/api/advertising')
      .send({ date: '2026-10-02', concept: 'Campaña ficticia', amount: '15000', notes: 'Prueba' });
    expect(r.status).toBe(201);
    const ad = r.body.id;
    expect(
      (
        await request(app)
          .put(`/api/advertising/${ad}`)
          .send({ date: '2026-10-02', concept: 'Actualizada', amount: '16000' })
      ).status,
    ).toBe(200);
    expect((await request(app).get(`/api/advertising?period_id=${period}`)).body).toHaveLength(1);
    expect((await request(app).delete(`/api/advertising/${ad}`)).status).toBe(200);
    const [a] = await query('SELECT * FROM activities WHERE id=?', [activity]);
    r = await request(app)
      .put(`/api/activities/${activity}`)
      .send({ ...a, active: true, days: [2, 3, 4, 5] });
    expect(r.status).toBe(200);
  });
  it('repite migraciones y seed sin duplicar ni restaurar reglas editadas', async () => {
    const before = await query('SELECT id FROM people ORDER BY id');
    await migrate();
    await seed();
    await seed();
    expect(await query('SELECT id FROM people ORDER BY id')).toEqual(before);
    expect(
      (
        await query('SELECT day FROM activity_allowed_days WHERE activity_id=? ORDER BY day', [
          activity,
        ])
      ).map((r) => r.day),
    ).toEqual([2, 3, 4, 5]);
    expect((await query('SELECT COUNT(*) count FROM activities'))[0].count).toBe(8);
    expect((await query('SELECT COUNT(*) count FROM instructors'))[0].count).toBe(6);
  });
  it('archiva preservando pagos y nuevo mes sin inscripciones', async () => {
    expect((await request(app).delete(`/api/people/${pid}`)).status).toBe(200);
    expect((await request(app).get(`/api/people/${pid}`)).body.payments.length).toBe(1);
    const r = await request(app).post('/api/periods').send({ year: 2026, month: 11 });
    expect((await request(app).get(`/api/enrollments?period_id=${r.body.id}`)).body).toHaveLength(
      0,
    );
  });
});
