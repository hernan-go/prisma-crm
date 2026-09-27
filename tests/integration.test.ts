import { cleanupPlan, applyCleanup } from '../server/qa-cleanup.js';
import { testCredentials } from './auth-helper.js';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../server/app.js';
import { pool, query, execute } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { seed } from '../server/seed.js';
const enabled = process.env.RUN_DB_TESTS === 'true';
const credentials = await testCredentials();
const app = createApp(credentials);
const agent = request.agent(app);
describe.skipIf(!enabled)('Integración MySQL real: recorrido completo', () => {
  let pid: number, period: number, activity: number, enrollment: number, payment: number;
  const person = { nombre: 'Persona Ficticia', apellido: 'Prueba QA', telefono: '0000001234' };
  beforeAll(async () => {
    if (process.env.DB_NAME !== 'prisma_test')
      throw new Error('Las pruebas requieren DB_NAME=prisma_test.');
    await migrate();
    expect(
      (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
    ).toBe(200);
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
    let r = await agent.post('/api/people').send(person);
    expect(r.status).toBe(201);
    pid = r.body.id;
    expect((await agent.post('/api/people').send(person)).status).toBe(409);
    r = await agent
      .put(`/api/people/${pid}`)
      .send({ ...person, emergency_name: 'Contacto ficticio', emergency_phone: '0000001235' });
    expect(r.status).toBe(200);
    expect((await agent.get(`/api/people/${pid}`)).body.emergency_phone).toBe('0000001235');
  });
  it('crea octubre vacío y rechaza período duplicado', async () => {
    const r = await agent.post('/api/periods').send({ year: 2026, month: 10 });
    expect(r.status).toBe(201);
    period = r.body.id;
    expect((await agent.get(`/api/enrollments?period_id=${period}`)).body).toEqual([]);
    expect((await agent.post('/api/periods').send({ year: 2026, month: 10 })).status).toBe(409);
  });
  it('inscribe dos actividades y múltiples slots, bloquea día inválido', async () => {
    const list = (await agent.get('/api/activities')).body;
    activity = list.find((a: any) => a.name.startsWith('Taller de la Memoria')).id;
    let r = await agent.post('/api/enrollments').send({
      person_id: pid,
      period_id: period,
      activity_id: activity,
      slots: [{ day: 1, start: '10:00', end: '12:00' }],
    });
    expect(r.status).toBe(422);
    r = await agent.post('/api/enrollments').send({
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
    r = await agent.post('/api/enrollments').send({
      person_id: pid,
      period_id: period,
      activity_id: list.find((a: any) => a.name.startsWith('Yoga')).id,
      slots: [{ day: 1, start: '11:00', end: '12:00' }],
    });
    expect(r.status).toBe(201);
    const es = (await agent.get(`/api/enrollments?period_id=${period}`)).body;
    expect(es).toHaveLength(2);
    expect(es.find((e: any) => e.id === enrollment).slots).toHaveLength(2);
  });
  it('calcula importe indefinido, dos carteras y deuda', async () => {
    expect((await agent.get(`/api/accounts?period_id=${period}`)).body[0].balance).toBeNull();
    expect(
      (
        await agent
          .put('/api/accounts')
          .send({ person_id: pid, period_id: period, amount_due: '60000' })
      ).status,
    ).toBe(200);
    for (const method of ['transfer', 'cash']) {
      const r = await agent
        .post('/api/payments')
        .send({ person_id: pid, period_id: period, date: '2026-10-01', amount: '20000', method });
      expect(r.status).toBe(201);
      payment = r.body.id;
    }
    const d = (await agent.get(`/api/dashboard?period_id=${period}`)).body;
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
    expect((await agent.get('/api/people?q=Ficticia')).body.total).toBe(1);
    expect((await agent.get('/api/people?q=0000001234')).body.total).toBe(1);
    expect(
      (
        await agent.put(`/api/payments/${payment}`).send({
          person_id: pid,
          period_id: period,
          date: '2026-10-01',
          amount: '50000',
          method: 'cash',
        })
      ).status,
    ).toBe(200);
    expect((await agent.get(`/api/accounts?period_id=${period}`)).body[0].balance).toBe(
      '-10000.00',
    );
    expect((await agent.delete(`/api/payments/${payment}`)).status).toBe(200);
    expect((await agent.get(`/api/accounts?period_id=${period}`)).body[0].balance).toBe('40000.00');
  });
  it('edita horarios y preserva persona al cancelar inscripción', async () => {
    expect(
      (
        await agent.put(`/api/enrollments/${enrollment}`).send({
          person_id: pid,
          period_id: period,
          activity_id: activity,
          slots: [{ day: 3, start: '19:00', end: '20:00' }],
        })
      ).status,
    ).toBe(200);
    expect((await agent.delete(`/api/enrollments/${enrollment}`)).status).toBe(200);
    expect((await agent.get(`/api/people/${pid}`)).status).toBe(200);
  });
  it('importa XLSX y rechaza duplicados en la misma transacción sin cambios parciales', async () => {
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet('Personas');
    s.addRow(['Nombre y apellido', 'Teléfono']);
    s.addRow(['Importación Ficticia', '0000005678']);
    const r = await agent
      .post('/api/import/preview')
      .attach('file', Buffer.from(await w.xlsx.writeBuffer()), 'prueba.xlsx');
    expect(r.status).toBe(200);
    expect(r.body.rows[0].review).toBe(true);
    const person = r.body.rows[0].person;
    const row = { person, action: 'create', reviewed: true };
    expect((await agent.post('/api/import/commit').send({ rows: [row, row] })).status).toBe(409);
    expect((await agent.get('/api/people?q=0000005678')).body.total).toBe(0);
    expect((await agent.post('/api/import/commit').send({ rows: [row] })).body.created).toBe(1);
  });
  it('omite incompletos y conserva contacto al actualizar desde importación', async () => {
    const response = await agent.post('/api/import/commit').send({
      rows: [
        { person: { nombre: 'Incompleta' }, action: 'skip', reviewed: true },
        { person, action: 'update', target_id: pid, reviewed: true },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ skipped: 1, updated: 1 });
    expect((await agent.get(`/api/people/${pid}`)).body.emergency_phone).toBe('0000001235');
  });
  it('serializa altas simultáneas que comparten teléfono', async () => {
    const data = { nombre: 'Concurrencia', apellido: 'Ficticia', telefono: '0000019191' };
    const results = await Promise.all([
      agent.post('/api/people').send(data),
      agent.post('/api/people').send(data),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it('publicidad CRUD separada de cobranzas y configuración editable', async () => {
    let r = await agent
      .post('/api/advertising')
      .send({ date: '2026-10-02', concept: 'Campaña ficticia', amount: '15000', notes: 'Prueba' });
    expect(r.status).toBe(201);
    const ad = r.body.id;
    expect(
      (
        await agent
          .put(`/api/advertising/${ad}`)
          .send({ date: '2026-10-02', concept: 'Actualizada', amount: '16000' })
      ).status,
    ).toBe(200);
    expect((await agent.get(`/api/advertising?period_id=${period}`)).body).toHaveLength(1);
    expect((await agent.delete(`/api/advertising/${ad}`)).status).toBe(200);
    const [a] = await query('SELECT * FROM activities WHERE id=?', [activity]);
    r = await agent
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
    expect((await agent.delete(`/api/people/${pid}`)).status).toBe(200);
    expect((await agent.get(`/api/people/${pid}`)).body.payments.length).toBe(1);
    const r = await agent.post('/api/periods').send({ year: 2026, month: 11 });
    expect((await agent.get(`/api/enrollments?period_id=${r.body.id}`)).body).toHaveLength(0);
  });
  it('protege agenda real, grupo, capacidad y concurrencia', async () => {
    const pr = (await agent.post('/api/periods').send({ year: 2027, month: 2 })).body.id;
    const p1 = (
      await agent
        .post('/api/people')
        .send({ nombre: 'Agenda', apellido: 'Ficticia Uno', telefono: '0000088001' })
    ).body.id;
    const p2 = (
      await agent
        .post('/api/people')
        .send({ nombre: 'Agenda', apellido: 'Ficticia Dos', telefono: '0000088002' })
    ).body.id;
    const list = (await agent.get('/api/activities')).body;
    const yoga = list.find((a: any) => a.name === 'Yoga Terapéutico Integral').id;
    const digital = list.find((a: any) => a.name === 'Inclusión Digital').id;
    const info = list.find((a: any) => a.name === 'Informática').id;
    const save = (person: number, act: number, start = '10:00', end = '11:00', day = 1) =>
      agent
        .post('/api/enrollments')
        .send({ person_id: person, period_id: pr, activity_id: act, slots: [{ day, start, end }] });
    expect((await save(p1, yoga)).status).toBe(201);
    expect((await save(p2, yoga)).status).toBe(201);
    expect((await save(p1, digital)).status).toBe(409);
    expect((await save(p1, digital, '11:00', '12:00')).status).toBe(201);
    expect((await save(p2, info, '11:30', '12:30')).status).toBe(409);
    const concurrent = await Promise.all([
      save(p1, info, '13:00', '14:00', 6),
      save(p2, info, '13:00', '14:00', 6),
    ]);
    expect(concurrent.map((r) => r.status).sort()).toEqual([201, 409]);
    const group = list.find((a: any) => a.id === yoga);
    expect(
      (
        await agent
          .put(`/api/activities/${yoga}`)
          .send({ ...group, active: true, mode: 'individual' })
      ).status,
    ).toBe(409);
    expect((await agent.delete(`/api/periods/${pr}`)).status).toBe(409);
    expect((await agent.put(`/api/periods/${pr}`).send({ year: 2027, month: 3 })).status).toBe(409);
    expect((await agent.patch(`/api/periods/${pr}/status`).send({ status: 'closed' })).status).toBe(
      200,
    );
    expect((await save(p2, info, '15:00', '16:00', 6)).status).toBe(409);
    expect(
      (await agent.put('/api/accounts').send({ person_id: p1, period_id: pr, amount_due: '10' }))
        .status,
    ).toBe(409);
    expect(
      (
        await agent
          .post('/api/payments')
          .send({ person_id: p1, period_id: pr, date: '2027-02-01', amount: '10', method: 'cash' })
      ).status,
    ).toBe(409);
    expect((await agent.patch(`/api/periods/${pr}/status`).send({ status: 'open' })).status).toBe(
      200,
    );
  });
  it('edita y elimina exclusivamente períodos vacíos', async () => {
    const pr = (await agent.post('/api/periods').send({ year: 2028, month: 1 })).body.id;
    expect((await agent.put(`/api/periods/${pr}`).send({ year: 2028, month: 2 })).status).toBe(200);
    expect((await agent.delete(`/api/periods/${pr}`)).status).toBe(200);
    expect((await agent.get('/api/periods')).body.some((p: any) => p.id === pr)).toBe(false);
  });
  it('Google Forms preview sin escritura, revisión, varias actividades y reintento seguro', async () => {
    const pr = (await agent.post('/api/periods').send({ year: 2027, month: 4 })).body.id;
    const csv =
      'Nombre Completo.;Número de Teléfono (con código de área);Elegí la opción que corresponde. TURNO MAÑANA;Elegí la opción que corresponde. TURNO TARDE;Pago\nForms Ficticia;0000055511;Yoga Terapéutico Integral Lunes 10 a 11 hs;Inclusión Digital Miércoles 10 a 12 hs;25000 T 23/4';
    const before = (await query('SELECT COUNT(*) n FROM people'))[0].n;
    const preview = await agent
      .post('/api/forms-import/preview')
      .field('period_id', String(pr))
      .attach('file', Buffer.from(csv), 'forms.csv');
    expect(preview.status).toBe(200);
    expect((await query('SELECT COUNT(*) n FROM people'))[0].n).toBe(before);
    const row = preview.body.rows[0];
    expect(row.selections).toHaveLength(2);
    const body = { period_id: pr, request_id: randomUUID(), confirmed: true, rows: [row] };
    expect((await agent.post('/api/forms-import/commit').send(body)).status).toBe(422);
    row.reviewed = true;
    row.payment.include = true;
    expect((await agent.post('/api/forms-import/commit').send(body)).status).toBe(422);
    row.payment.approved = true;
    const result = await agent.post('/api/forms-import/commit').send(body);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ created: 1, enrollments: 2, payments: 1 });
    expect((await agent.post('/api/forms-import/commit').send(body)).body).toEqual(result.body);
    expect((await agent.get(`/api/payments?period_id=${pr}`)).body).toHaveLength(1);
    const second = await agent
      .post('/api/forms-import/preview')
      .field('period_id', String(pr))
      .attach('file', Buffer.from(csv), 'forms.csv');
    expect(second.body.rows[0].matches).toHaveLength(1);
    const old = second.body.rows[0];
    old.action = 'keep';
    old.reviewed = true;
    old.payment.include = false;
    expect(
      (
        await agent
          .post('/api/forms-import/commit')
          .send({ period_id: pr, request_id: randomUUID(), confirmed: true, rows: [old] })
      ).body.kept,
    ).toBe(1);
    expect((await agent.get(`/api/enrollments?period_id=${pr}`)).body).toHaveLength(2);
  });
  it('Forms mapeo manual alternativo y conflicto revierte persona y movimientos', async () => {
    const pr = (await query('SELECT id FROM periods WHERE year=2027 AND month=4'))[0].id;
    const csv =
      'X;Y;Z\nOtra Ficticia;0000055522;Yoga Terapéutico Integral Lunes 10 a 11 hs, Inclusión Digital Lunes 10 a 12 hs';
    const preview = await agent
      .post('/api/forms-import/preview')
      .field('period_id', String(pr))
      .field('mapping', JSON.stringify({ full_name: 0, telefono: 1, morning: 2 }))
      .attach('file', Buffer.from(csv), 'alternate.csv');
    expect(preview.status).toBe(200);
    const row = preview.body.rows[0];
    row.reviewed = true;
    expect(
      (
        await agent
          .post('/api/forms-import/commit')
          .send({ period_id: pr, request_id: randomUUID(), confirmed: true, rows: [row] })
      ).status,
    ).toBe(409);
    expect(
      await query('SELECT id FROM people WHERE phone_normalized=?', ['0000055522']),
    ).toHaveLength(0);
  });
  it('cierre bloquea publicidad y eliminación de movimientos', async () => {
    const pr = (await agent.post('/api/periods').send({ year: 2029, month: 1 })).body.id;
    const person = (
      await agent
        .post('/api/people')
        .send({ nombre: 'Cierre', apellido: 'Ficticia', telefono: '0000030099' })
    ).body.id;
    const ad = (
      await agent
        .post('/api/advertising')
        .send({ date: '2029-01-02', concept: 'QA cierre', amount: '20' })
    ).body.id;
    const pay = (
      await agent
        .post('/api/payments')
        .send({
          person_id: person,
          period_id: pr,
          date: '2029-01-02',
          amount: '10',
          method: 'cash',
        })
    ).body.id;
    await agent.patch(`/api/periods/${pr}/status`).send({ status: 'closed' });
    expect((await agent.delete(`/api/payments/${pay}`)).status).toBe(409);
    expect((await agent.delete(`/api/advertising/${ad}`)).status).toBe(409);
    expect(
      (
        await agent
          .post('/api/advertising')
          .send({ date: '2029-01-03', concept: 'QA bloqueada', amount: '10' })
      ).status,
    ).toBe(409);
    expect(
      (
        await agent
          .put(`/api/advertising/${ad}`)
          .send({ date: '2029-02-02', concept: 'QA mover', amount: '20' })
      ).status,
    ).toBe(409);
  });
  it('plan QA no elimina sin aprobación y protege cambios posteriores y estructura', async () => {
    const id = (
      await agent
        .post('/api/people')
        .send({ nombre: 'Juan', apellido: 'Test', telefono: '0000037777' })
    ).body.id;
    const before = (await query('SELECT COUNT(*) n FROM activities'))[0].n;
    const plan = await cleanupPlan();
    expect(plan.candidates.some((c) => c.table === 'people' && c.id === id)).toBe(true);
    expect((await applyCleanup(plan, 'prisma_test')).deleted).toBe(0);
    const candidate = plan.candidates.find((c) => c.table === 'people' && c.id === id)!;
    candidate.reviewed = true;
    await execute('UPDATE people SET observaciones=? WHERE id=?', [
      'Cambiado después del plan',
      id,
    ]);
    await expect(applyCleanup(plan, 'prisma_test')).rejects.toThrow('cambiaron');
    const fresh = await cleanupPlan();
    fresh.candidates.find((c) => c.table === 'people' && c.id === id)!.reviewed = true;
    expect((await applyCleanup(fresh, 'prisma_test')).deleted).toBe(1);
    expect((await query('SELECT COUNT(*) n FROM activities'))[0].n).toBe(before);
  });
});
