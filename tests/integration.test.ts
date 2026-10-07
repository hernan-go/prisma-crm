import {
  expenseTests,
  expenseMigrationFixture,
  verifyExpenseMigration,
  verifyExpenseMigrationPreflight,
} from './expenses-cases.js';
import { monthlyModelTests } from './monthly-model-cases.js';
import { clonePeriodTests } from './clone-period-cases.js';
import { facilitatorTests } from './facilitator-cases.js';
import { formsImportTests } from './forms-import-cases.js';
import { formsFinanceTests } from './forms-finance-cases.js';
import {
  legacyFixture,
  resetTestSchema,
  prepareSchedules,
  incorporateTestPerson,
} from './model-fixtures.js';
import { membershipTests, verifyMembershipMigration } from './membership-cases.js';
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
async function enroll(body: any, eid?: number) {
  const result = await prepareSchedules(agent, body.period_id, body.activity_id, body.slots);
  if (result.error) return result.error;
  await incorporateTestPerson(agent, body.person_id, body.period_id);
  return eid
    ? agent.put(`/api/enrollments/${eid}`).send({ ...body, schedule_ids: result.ids })
    : agent.post('/api/enrollments').send({ ...body, schedule_ids: result.ids });
}
describe.skipIf(!enabled)('Integración MySQL real: recorrido completo', () => {
  let pid: number, period: number, activity: number, enrollment: number, payment: number;
  const person = { nombre: 'Persona Ficticia', apellido: 'Prueba QA', telefono: '0000001234' };
  beforeAll(async () => {
    if (process.env.DB_NAME !== 'prisma_test')
      throw new Error('Las pruebas requieren DB_NAME=prisma_test.');
    await resetTestSchema();
    await migrate('004.sql');
    await legacyFixture();
    await expenseMigrationFixture();
    expect(
      (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
    ).toBe(200);
    const preservedTables = [
      'people',
      'periods',
      'enrollments',
      'payments',
      'monthly_accounts',
      'admin_sessions',
      'import_receipts',
      'advertising_investments',
    ];
    const snapshots = await Promise.all(
      preservedTables.map((table) => query(`SELECT * FROM ${table}`)),
    );
    const pre = await query('SELECT * FROM payments');
    const accountsBefore = await query('SELECT * FROM monthly_accounts');
    await migrate('006.sql');
    await verifyExpenseMigrationPreflight();
    // Only the explicit fixture creation may add a period; migration may not.
    snapshots[preservedTables.indexOf('periods')] = await query('SELECT * FROM periods');
    await migrate();
    for (const [index, table] of preservedTables.entries()) {
      const rows = await query(`SELECT * FROM ${table}`);
      expect(rows).toEqual(snapshots[index]);
    }
    await verifyExpenseMigration();
    expect((await agent.get('/api/auth/session')).body.authenticated).toBe(true);
    const migratedAccounts = (await agent.get('/api/accounts?period_id=1')).body;
    expect(migratedAccounts[0]).toMatchObject({
      amount_due: '50000.00',
      paid: '50000.00',
      balance: '0.00',
    });
    expect(await query('SELECT * FROM payments')).toEqual(pre);
    expect(await query('SELECT * FROM monthly_accounts')).toEqual(accountsBefore);
    await verifyMembershipMigration();
    const migrated = await query(
      'SELECT si.display_name,s.start,s.end,s.day FROM schedule_instructors si JOIN activity_schedules s ON s.id=si.schedule_id',
    );
    expect(migrated).toContainEqual({
      display_name: 'Facilitador migración',
      day: 1,
      start: '11:00',
      end: '12:30',
    });
    expect(
      (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
    ).toBe(200);
    for (const table of [
      'period_expenses',
      'period_expense_categories',
      'payments',
      'monthly_accounts',
      'enrollment_slots',
      'enrollments',
      'period_memberships',
      'schedule_instructors',
      'activity_schedules',
      'period_activity_days',
      'period_activities',
      'activity_allowed_days',
      'activities',
      'instructors',
      'periods',
      'people',
      'advertising_investments',
    ])
      await execute(`DELETE FROM ${table}`);
    await legacyFixture(false);
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
    let r = await enroll({
      person_id: pid,
      period_id: period,
      activity_id: activity,
      slots: [{ day: 1, start: '10:00', end: '12:00' }],
    });
    expect(r.status).toBe(422);
    r = await enroll({
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
    r = await enroll({
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
    expect((await agent.delete(`/api/payments/${payment}?period_id=${period}`)).status).toBe(200);
    expect((await agent.get(`/api/accounts?period_id=${period}`)).body[0].balance).toBe('40000.00');
  });
  it('edita horarios y preserva persona al cancelar inscripción', async () => {
    expect(
      (
        await enroll(
          {
            person_id: pid,
            period_id: period,
            activity_id: activity,
            slots: [{ day: 3, start: '19:00', end: '20:00' }],
          },
          enrollment,
        )
      ).status,
    ).toBe(200);
    expect((await agent.delete(`/api/enrollments/${enrollment}?period_id=${period}`)).status).toBe(
      200,
    );
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
  it('retira API antigua de publicidad y conserva configuración editable', async () => {
    expect((await agent.get(`/api/advertising?period_id=${period}`)).status).toBe(410);
    expect(
      (
        await agent
          .post('/api/advertising')
          .send({ date: '2026-10-02', concept: 'Vieja', amount: '10' })
      ).status,
    ).toBe(410);
    expect((await agent.put('/api/advertising/1').send({ concept: 'Vieja' })).status).toBe(410);
    expect((await agent.delete('/api/advertising/1')).status).toBe(410);
    const [a] = await query('SELECT * FROM activities WHERE id=?', [activity]);
    const r = await agent
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
      enroll({ person_id: person, period_id: pr, activity_id: act, slots: [{ day, start, end }] });
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
    const group = (await agent.get(`/api/offerings?period_id=${pr}`)).body.find(
      (a: any) => a.activity_id === yoga,
    );
    expect(
      (
        await agent
          .put(`/api/offerings/${group.id}`)
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
    await prepareSchedules(agent, pr, 'Yoga Terapéutico Integral', [
      { day: 1, start: '10:00', end: '11:00' },
    ]);
    await prepareSchedules(agent, pr, 'Inclusión Digital', [
      { day: 3, start: '10:00', end: '12:00' },
      { day: 1, start: '10:00', end: '12:00' },
    ]);
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
    // Financial inputs are manual; including a payment requires complete values, not a second check.
    expect(row.payment).toEqual({
      amount: '',
      method: '',
      date: '',
      include: false,
    });
    row.payment.include = true;
    expect((await agent.post('/api/forms-import/commit').send(body)).status).toBe(422);
    Object.assign(row.payment, { amount: '25000', method: 'transfer', date: '2027-04-23' });
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
  it('cierre bloquea eliminación de movimientos de cobro', async () => {
    const pr = (await agent.post('/api/periods').send({ year: 2029, month: 1 })).body.id;
    const person = (
      await agent
        .post('/api/people')
        .send({ nombre: 'Cierre', apellido: 'Ficticia', telefono: '0000030099' })
    ).body.id;
    await incorporateTestPerson(agent, person, pr);
    const pay = (
      await agent.post('/api/payments').send({
        person_id: person,
        period_id: pr,
        date: '2029-01-02',
        amount: '10',
        method: 'cash',
      })
    ).body.id;
    await agent.patch(`/api/periods/${pr}/status`).send({ status: 'closed' });
    expect((await agent.delete(`/api/payments/${pay}?period_id=${pr}`)).status).toBe(409);
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
    const qaPeriod = (await agent.post('/api/periods').send({ year: 2029, month: 2 })).body.id;
    const qaMember = (
      await agent.post(`/api/periods/${qaPeriod}/memberships`).send({ person_id: id })
    ).body.id;
    const protectedPlan = await cleanupPlan();
    protectedPlan.candidates.find((c) => c.table === 'people' && c.id === id)!.reviewed = true;
    await expect(applyCleanup(protectedPlan, 'prisma_test')).rejects.toThrow('pertenencia');
    expect((await agent.delete(`/api/periods/${qaPeriod}/memberships/${qaMember}`)).status).toBe(
      200,
    );
    const fresh = await cleanupPlan();
    fresh.candidates.find((c) => c.table === 'people' && c.id === id)!.reviewed = true;
    expect((await applyCleanup(fresh, 'prisma_test')).deleted).toBe(1);
    expect((await query('SELECT COUNT(*) n FROM activities'))[0].n).toBe(before);
  });
  it('DNI normalizado funciona en búsqueda, aviso y validación final', async () => {
    const p = { nombre: 'DNI', apellido: 'Ficticio', telefono: '0000037766', dni: '12.345.678' };
    expect((await agent.post('/api/people').send(p)).status).toBe(201);
    expect((await agent.get('/api/people?q=12345678')).body.total).toBe(1);
    const matches = await agent.post('/api/people/matches').send({ dni: '12345678' });
    expect(matches.body[0].reason).toBe('mismo DNI');
    expect(
      (await agent.post('/api/people').send({ ...p, telefono: '0000037765', dni: '12345678' }))
        .status,
    ).toBe(409);
  });
  // Separate application lifetime keeps each scenario suite below the real rate limit.
  // Production limits remain enabled and unchanged.
  expenseTests(request.agent(createApp(credentials)), credentials.password);
  monthlyModelTests(request.agent(createApp(credentials)), credentials.password);
  formsImportTests(request.agent(createApp(credentials)), credentials.password);
  formsFinanceTests(request.agent(createApp(credentials)), credentials.password);
  facilitatorTests(request.agent(createApp(credentials)), credentials.password);
  clonePeriodTests(request.agent(createApp(credentials)), credentials.password);
  membershipTests(request.agent(createApp(credentials)), credentials.password);
});
