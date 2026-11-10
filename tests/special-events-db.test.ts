import { disposableDatabase } from '../server/disposable-database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { pool, query, execute } from '../server/db';
import { migrate } from '../server/migrate';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';
import { EventRequests, type PendingEventRequest } from '../client/event-requests';
import { ApiError } from '../client/api';
import { personSave } from '../server/services';
import { duplicates } from '../server/repositories';
import { personSchema } from '../shared/domain';
import { periodEdit } from '../server/scheduling';
import { eventExpenseSave, eventExpenseVoid } from '../server/special-events';
import {
  expenseCategorySave,
  expenseCategoryDelete,
  expenseSave,
  expenseDelete,
} from '../server/expenses';
import { statisticsSummary, statisticsExpenseBreakdown } from '../server/statistics';
import { readEventEconomy } from '../server/event-economy';
import { monthlyContext } from '../server/integrations/ai-context';
import { eventsContext } from '../server/integrations/ai-events';
import { paymentSave } from '../server/services';
import {
  command,
  eventCreate,
  eventDelete,
  eventMovementEdit,
  eventDetail,
  eventEdit,
  eventList,
  eventMovementAdd,
  eventMovementVoid,
  eventParticipantAdd,
  eventParticipantEdit,
  eventReschedule,
  eventSetStatus,
  readEventFinancialRows,
} from '../server/special-events';

const enabled = process.env.RUN_EVENT_DB_TESTS === 'true';
const qaDatabase = process.env.DB_NAME || '';
const eventIds: number[] = [],
  personIds: number[] = [],
  periodIds: number[] = [];
const originalTables = [
  'people',
  'periods',
  'period_memberships',
  'enrollments',
  'monthly_accounts',
  'payments',
  'period_expense_categories',
  'period_expenses',
  'special_events',
  'event_participants',
  'event_money_movements',
];
const categoryIds: number[] = [],
  accountIds: number[] = [];
let verified = false,
  before: Record<string, string> = {},
  agent: ReturnType<typeof request.agent>;
let p1: number, p2: number, person1: number, person2: number, person3: number;
const eventFields = {
  name: 'Evento ficticio Etapa 1',
  description: 'QA aislada',
  date: '2090-01-15',
  start_time: '18:15',
  end_time: '21:45',
  price: '100.20',
  capacity: null,
  notes: '',
};
async function snapshot() {
  const result: Record<string, string> = {};
  for (const table of originalTables) {
    const rows = await query(`SELECT * FROM ${table} ORDER BY id`);
    result[table] = createHash('sha256')
      .update(
        JSON.stringify(
          rows.map(
            ({ special_event_id: _event, voided_at: _void, void_reason: _reason, ...original }) =>
              original,
          ),
        ),
      )
      .digest('hex');
  }
  return result;
}
async function newEvent(capacity: number | null = null) {
  const body = { ...eventFields, period_id: p1, capacity, request_id: randomUUID() };
  const result = await eventCreate(body);
  eventIds.push(result.id);
  return { ...result, body };
}
async function cmd(id: number) {
  return { request_id: randomUUID(), expected_revision: (await eventDetail(id)).revision };
}
async function join(id: number, person = person1, price = '100.20') {
  return eventParticipantAdd(id, { ...(await cmd(id)), person_id: person, price, notes: '' });
}
async function pay(id: number, participant: number, amount = '100.20', kind = 'collection') {
  return eventMovementAdd(id, participant, {
    ...(await cmd(id)),
    kind,
    date: '2089-12-01',
    amount,
    recipient: 'jesica',
    method: 'transfer',
    notes: 'Movimiento ficticio',
  });
}
afterAll(async () => {
  try {
    if (verified) {
      for (const category of categoryIds) {
        await execute('DELETE FROM period_expenses WHERE category_id=?', [category]);
        await execute('DELETE FROM period_expense_categories WHERE id=?', [category]);
      }
      for (const account of accountIds) {
        await execute('DELETE FROM payments WHERE account_id=?', [account]);
        await execute('DELETE FROM monthly_accounts WHERE id=?', [account]);
      }
      for (const period of periodIds)
        for (const person of personIds)
          await execute('DELETE FROM period_memberships WHERE period_id=? AND person_id=?', [
            period,
            person,
          ]);
      for (const event of eventIds) {
        await execute(
          'DELETE m FROM event_money_movements m JOIN event_participants p ON p.id=m.participant_id WHERE p.event_id=?',
          [event],
        );
        await execute('DELETE FROM event_participants WHERE event_id=?', [event]);
        await execute('DELETE FROM special_events WHERE id=?', [event]);
      }
      for (const person of personIds) await execute('DELETE FROM people WHERE id=?', [person]);
      for (const period of periodIds) await execute('DELETE FROM periods WHERE id=?', [period]);
      expect(await snapshot()).toEqual(before);
    }
  } finally {
    await pool.end();
  }
});
describe.skipIf(!enabled)('Eventos: integración aislada en QA local', () => {
  beforeAll(async () => {
    if (
      process.env.DB_NAME !== disposableDatabase() ||
      !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || '127.0.0.1')
    )
      throw Error('Only explicitly authorized local QA');
    expect((await query('SELECT DATABASE() db,CURRENT_USER() user,@@port port'))[0]).toMatchObject({
      db: qaDatabase,
    });
    const baseline = await query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name<='013.sql' ORDER BY name",
    );
    expect(baseline.map((row) => row.name)).toEqual(
      Array.from({ length: 13 }, (_, i) => `${String(i + 1).padStart(3, '0')}.sql`),
    );
    before = await snapshot();
    await migrate('014.sql');
    await migrate('015.sql');
    await migrate('016.sql');
    expect(await snapshot()).toEqual(before);
    verified = true;
    // Explicit fixture periods only, never reset/seed/clean unrelated records.
    for (let year = 2090; year <= 2100 && periodIds.length < 2; year++) {
      for (let month = 1; month <= 12 && periodIds.length < 2; month++) {
        if ((await query('SELECT id FROM periods WHERE year=? AND month=?', [year, month])).length)
          continue;
        periodIds.push(
          (await execute('INSERT INTO periods(year,month) VALUES (?,?)', [year, month])).insertId,
        );
      }
    }
    if (periodIds.length !== 2) throw Error('No unused fixture periods');
    [p1, p2] = periodIds;
    const [period] = await query('SELECT year,month FROM periods WHERE id=?', [p1]);
    eventFields.date = `${period.year}-${String(period.month).padStart(2, '0')}-15`;
    for (const nombre of ['QA Eventos Uno', 'QA Eventos Dos', 'QA Eventos Tres'])
      personIds.push((await personSave({ nombre, apellido: randomUUID(), telefono: '' })).id);
    [person1, person2, person3] = personIds;
    const credentials = await testCredentials();
    agent = request.agent(createApp({ ...credentials, store: memorySessions() }));
    expect(
      (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
    ).toBe(200);
  }, 20000);
  it('registra 014, permite replay registrado y rechaza aplicación parcial sin alterarla', async () => {
    await migrate('014.sql');
    expect(await query("SELECT name FROM schema_migrations WHERE name='014.sql'")).toHaveLength(1);
    await execute("DELETE FROM schema_migrations WHERE name='014.sql'");
    try {
      await expect(migrate('014.sql')).rejects.toThrow('aplicación parcial');
    } finally {
      await execute("INSERT INTO schema_migrations(name) VALUES ('014.sql')");
    }
    const constraints = await query(
      "SELECT CONSTRAINT_TYPE,ENFORCED FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN ('special_events','event_participants','event_money_movements')",
    );
    expect(constraints.filter((c) => c.CONSTRAINT_TYPE === 'FOREIGN KEY')).toHaveLength(4);
    expect(
      constraints.filter((c) => c.CONSTRAINT_TYPE === 'CHECK').every((c) => c.ENFORCED === 'YES'),
    ).toBe(true);
  });
  it('crea Personas sin teléfono, no las marca duplicadas por vacío y conserva DNI/email', async () => {
    const empty = personSchema.parse({ nombre: 'QA', apellido: 'Otro', telefono: '' });
    expect(await duplicates(empty)).toEqual([]);
    await personSave({ ...empty, dni: '999-EVENT-QA', email: 'event-qa@example.invalid' }, person3);
    expect((await duplicates({ ...empty, dni: '999EVENTQA' })).map((p) => p.id)).toContain(person3);
    expect(
      (await duplicates({ ...empty, email: 'event-qa@example.invalid' })).map((p) => p.id),
    ).toContain(person3);
    expect((await agent.post('/api/people').send({ ...empty, telefono: 'abc' })).status).toBe(422);
  });
  it('crea una sola vez y conserva recibo aun después de editar', async () => {
    const event = await newEvent();
    const again = await eventCreate(event.body);
    expect(again.id).toBe(event.id);
    await eventEdit(event.id, { ...eventFields, ...(await cmd(event.id)), name: 'Nuevo título' });
    expect(await eventCreate(event.body)).toEqual({ id: event.id, revision: 1 });
    await expect(eventCreate({ ...event.body, name: 'Otro payload' })).rejects.toMatchObject({
      status: 409,
    });
    const member = await join(event.id);
    expect(member.id).toBeGreaterThan(0);
    expect(
      await query('SELECT id FROM monthly_accounts WHERE person_id=?', [person1]),
    ).toHaveLength(0);
    expect(
      await query('SELECT id FROM period_memberships WHERE person_id=?', [person1]),
    ).toHaveLength(0);
    expect(await query('SELECT id FROM enrollments WHERE person_id=?', [person1])).toHaveLength(0);
    expect((await eventDetail(event.id)).history.map((h) => h.action)).toEqual([
      'create',
      'edit',
      'participant-add',
    ]);
  });
  it('rechaza fecha incompatible, período inexistente, revisión obsoleta y campos ajenos', async () => {
    const event = await newEvent();
    await expect(
      eventEdit(event.id, { ...eventFields, ...(await cmd(event.id)), date: '2026-11-02' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      eventCreate({ ...event.body, request_id: randomUUID(), period_id: 4294967295 }),
    ).rejects.toMatchObject({ status: 404 });
    await join(event.id);
    await expect(
      eventEdit(event.id, { ...eventFields, request_id: randomUUID(), expected_revision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await agent
          .patch(`/api/special-events/${event.id}`)
          .send({ ...eventFields, ...(await cmd(event.id)), period_id: p2 })
      ).status,
    ).toBe(422);
  });
  it('no impone cupos y serializa altas con revisión optimista', async () => {
    const event = await newEvent(1),
      command = await cmd(event.id);
    const results = await Promise.allSettled([
      eventParticipantAdd(event.id, { ...command, person_id: person1, price: '25' }),
      eventParticipantAdd(event.id, {
        ...command,
        request_id: randomUUID(),
        person_id: person2,
        price: '0',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await join(event.id, person3);
    await eventEdit(event.id, {
      ...eventFields,
      ...(await cmd(event.id)),
      capacity: 1,
      price: '300',
    });
    expect((await eventDetail(event.id)).participants).toHaveLength(2);
    expect((await eventDetail(event.id)).participants[0].price).not.toBe('300.00');
  });
  it('registra parciales exactos, no compensa deudas y conserva excesos tras cambiar precio', async () => {
    const event = await newEvent(),
      member = await join(event.id);
    await join(event.id, person2, '0');
    await pay(event.id, member.id, '0.10');
    await pay(event.id, member.id, '0.20');
    expect(await eventDetail(event.id)).toMatchObject({ gross: '0.30', pending: '99.90' });
    await pay(event.id, member.id, '100.00');
    await eventParticipantEdit(event.id, member.id, {
      ...(await cmd(event.id)),
      price: '50.00',
      active: true,
    });
    expect((await eventDetail(event.id)).participants[0]).toMatchObject({
      paid: '100.30',
      pending: '0.00',
      excess: '50.30',
    });
  });
  it('protege reintentos concurrentes de dinero, claves reutilizadas y pertenencia de participante', async () => {
    const event = await newEvent(),
      member = await join(event.id),
      body = {
        ...(await cmd(event.id)),
        kind: 'collection',
        date: '2089-12-01',
        amount: '100',
        recipient: 'hernan',
        method: 'cash',
      };
    const [a, b] = await Promise.all([
      eventMovementAdd(event.id, member.id, body),
      eventMovementAdd(event.id, member.id, body),
    ]);
    expect(a).toEqual(b);
    expect((await eventDetail(event.id)).movements).toHaveLength(1);
    await expect(
      eventMovementAdd(event.id, member.id, { ...body, amount: '200' }),
    ).rejects.toMatchObject({ status: 409 });
    const other = await newEvent(),
      otherMember = await join(other.id);
    await expect(
      eventMovementAdd(event.id, otherMember.id, { ...body, ...(await cmd(event.id)) }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('elimina inscripción, excluye cobros originales y reincorpora sin restaurarlos', async () => {
    const event = await newEvent(),
      member = await join(event.id, person1, '25');
    await pay(event.id, member.id, '25');
    await eventParticipantEdit(event.id, member.id, {
      ...(await cmd(event.id)),
      price: '25',
      active: false,
    });
    expect(await eventDetail(event.id)).toMatchObject({
      active_count: 0,
      gross: '0.00',
      due: '0.00',
      pending: '0.00',
      effective_net: '0.00',
    });
    const again = await join(event.id, person1, '100');
    expect(again.id).toBe(member.id);
    expect(await eventDetail(event.id)).toMatchObject({
      active_count: 1,
      due: '25.00',
      gross: '0.00',
      pending: '25.00',
    });
    await pay(event.id, member.id, '10');
    expect((await eventDetail(event.id)).gross).toBe('10.00');
  });
  it('rechaza reintegros nuevos y conserva cobros si no se modifica la inscripción', async () => {
    const event = await newEvent(),
      member = await join(event.id);
    await pay(event.id, member.id, '100');
    await expect(pay(event.id, member.id, '20', 'refund')).rejects.toMatchObject({ status: 422 });
    expect(await eventDetail(event.id)).toMatchObject({ active_count: 1, gross: '100.00' });
  });
  it('edita y elimina cobros con historial, idempotencia y atribución corregida', async () => {
    const event = await newEvent(),
      member = await join(event.id),
      payment = await pay(event.id, member.id, '100');
    const body = {
      ...(await cmd(event.id)),
      kind: 'collection',
      date: eventFields.date,
      amount: '25.10',
      recipient: 'hernan',
      method: 'cash',
    };
    const edited = await eventMovementEdit(event.id, payment.id, body);
    expect(await eventMovementEdit(event.id, payment.id, body)).toEqual(edited);
    const economy = await readEventEconomy(p1, pool);
    expect(economy.events.find((e) => e.id === event.id)?.wallets.hernan.cash).toBe('25.10');
    const deletion = { ...(await cmd(event.id)), reason: 'Corrección' };
    const result = await eventMovementVoid(event.id, payment.id, deletion);
    expect(await eventMovementVoid(event.id, payment.id, deletion)).toEqual(result);
    expect((await eventDetail(event.id)).gross).toBe('0.00');
    expect((await eventDetail(event.id)).movements).toHaveLength(1);
  });
  it('cancelación excluye todas las cifras, preserva identidad mínima y recibo', async () => {
    const event = await newEvent(),
      member = await join(event.id);
    await pay(event.id, member.id);
    const body = { ...(await cmd(event.id)), reason: 'Prueba' };
    const receipt = await eventDelete(event.id, body);
    expect(await eventDelete(event.id, body)).toEqual(receipt);
    expect((await eventList(p1)).some((e) => e.id === event.id)).toBe(false);
    const historical = (await readEventEconomy(p1, pool)).events.find((e) => e.id === event.id)!;
    expect(historical).toMatchObject({
      status: 'cancelled',
      commercial: null,
      cancelled_participants: 1,
      collections: '0.00',
      effective_net: '0.00',
    });
    expect(historical.cancelled_at).toBeTruthy();
    expect(historical.wallets.jesica.total).toBe('0.00');
    await expect(pay(event.id, member.id)).rejects.toMatchObject({ status: 409 });
  });
  it('reprograma el mismo evento y movimientos entre meses; origen y destino cerrados bloquean', async () => {
    const event = await newEvent(),
      member = await join(event.id);
    await pay(event.id, member.id);
    const [destination] = await query('SELECT year,month FROM periods WHERE id=?', [p2]);
    const body = {
      ...(await cmd(event.id)),
      period_id: p2,
      date: `${destination.year}-${String(destination.month).padStart(2, '0')}-10`,
      start_time: '17:00',
      end_time: '20:00',
      reason: 'Cambio de fecha',
    };
    const original = (await eventDetail(event.id)).movements;
    await execute("UPDATE periods SET status='closed' WHERE id=?", [p2]);
    try {
      await expect(eventReschedule(event.id, body)).rejects.toMatchObject({ status: 409 });
    } finally {
      await execute("UPDATE periods SET status='open' WHERE id=?", [p2]);
    }
    await execute("UPDATE periods SET status='closed' WHERE id=?", [p1]);
    try {
      await expect(eventReschedule(event.id, body)).rejects.toMatchObject({ status: 409 });
    } finally {
      await execute("UPDATE periods SET status='open' WHERE id=?", [p1]);
    }
    await eventReschedule(event.id, body);
    expect((await eventDetail(event.id)).movements).toEqual(original);
    expect((await eventDetail(event.id)).participants[0].id).toBe(member.id);
    expect((await readEventFinancialRows(p1, pool)).some((m) => m.event_id === event.id)).toBe(
      false,
    );
    expect(
      (await readEventFinancialRows(p2, pool)).some(
        (m) => m.event_id === event.id && m.date === '2089-12-01',
      ),
    ).toBe(true);
    expect(await eventReschedule(event.id, body)).toMatchObject({ id: event.id });
  });
  it('bloquea toda escritura en cerrado, mantiene consulta y devuelve recibo previo sin escribir', async () => {
    const event = await newEvent(),
      member = await join(event.id),
      body = {
        ...(await cmd(event.id)),
        kind: 'collection',
        date: '2089-12-01',
        amount: '20',
        recipient: 'jesica',
        method: 'cash',
      };
    const receipt = await eventMovementAdd(event.id, member.id, body),
      state = await eventDetail(event.id);
    await execute("UPDATE periods SET status='closed' WHERE id=?", [p1]);
    try {
      expect(await eventMovementAdd(event.id, member.id, body)).toEqual(receipt);
      const command = { request_id: randomUUID(), expected_revision: state.revision };
      const actions = [
        () => eventEdit(event.id, { ...eventFields, ...command }),
        () => eventParticipantAdd(event.id, { ...command, person_id: person2, price: '0' }),
        () => eventParticipantEdit(event.id, member.id, { ...command, price: '10', active: false }),
        () => eventSetStatus(event.id, { ...command, status: 'cancelled' }),
        () => eventMovementAdd(event.id, member.id, { ...body, ...command }),
        () => eventMovementVoid(event.id, receipt.id, { ...command, reason: 'Error' }),
      ];
      for (const action of actions) await expect(action()).rejects.toMatchObject({ status: 409 });
      expect(await eventDetail(event.id)).toEqual(state);
    } finally {
      await execute("UPDATE periods SET status='open' WHERE id=?", [p1]);
    }
  });
  it('protege referencias, fecha/borrado de período y FK incluso fuera de API', async () => {
    const event = await newEvent(),
      member = await join(event.id);
    await pay(event.id, member.id);
    await expect(periodEdit(p1, { year: 2080, month: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(periodEdit(p1)).rejects.toMatchObject({ status: 409 });
    await expect(
      execute('DELETE FROM special_events WHERE id=?', [event.id]),
    ).rejects.toMatchObject({ code: 'ER_ROW_IS_REFERENCED_2' });
    await expect(
      execute('DELETE FROM event_participants WHERE id=?', [member.id]),
    ).rejects.toMatchObject({ code: 'ER_ROW_IS_REFERENCED_2' });
    await expect(
      execute('UPDATE event_money_movements SET amount=0 WHERE participant_id=?', [member.id]),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });
  it('API autenticada: validación, origen, aislamiento y recorrido de estados', async () => {
    expect(
      (
        await request(createApp({ ...(await testCredentials()), store: memorySessions() })).get(
          `/api/special-events?period_id=${p1}`,
        )
      ).status,
    ).toBe(401);
    expect(
      (await agent.post('/api/special-events').set('Origin', 'https://evil.invalid').send({}))
        .status,
    ).toBe(403);
    expect((await agent.post('/api/special-events').send({})).status).toBe(422);
    expect((await agent.get('/api/special-events?period_id=1&arbitrary=true')).status).toBe(422);
    const event = await newEvent();
    for (const status of ['confirmed', 'held'])
      expect(
        (
          await agent
            .post(`/api/special-events/${event.id}/status`)
            .send({ ...(await cmd(event.id)), status })
        ).status,
      ).toBe(200);
    expect((await agent.get(`/api/special-events/${event.id}`)).body.status).toBe('held');
    expect((await agent.delete(`/api/special-events/${event.id}`)).status).toBe(404);
  });
  it('API de participantes y dinero conserva las cuatro combinaciones sin crear cuentas de talleres', async () => {
    const event = await newEvent();
    const added = await agent.post(`/api/special-events/${event.id}/participants`).send({
      ...(await cmd(event.id)),
      person_id: person1,
      price: '10.00',
    });
    expect(added.status).toBe(201);
    for (const recipient of ['jesica', 'hernan']) {
      for (const method of ['cash', 'transfer']) {
        const body = {
          ...(await cmd(event.id)),
          kind: 'collection',
          date: '2089-12-01',
          amount: '0.10',
          recipient,
          method,
        };
        const first = await agent
          .post(`/api/special-events/${event.id}/participants/${added.body.id}/movements`)
          .send(body);
        const retry = await agent
          .post(`/api/special-events/${event.id}/participants/${added.body.id}/movements`)
          .send(body);
        expect(first.status).toBe(201);
        expect(retry.body).toEqual(first.body);
      }
    }
    expect((await eventDetail(event.id)).movements).toHaveLength(4);
    expect((await eventDetail(event.id)).effective_net).toBe('0.40');
    expect(
      await query('SELECT id FROM monthly_accounts WHERE person_id=?', [person1]),
    ).toHaveLength(0);
  });
  it('el cliente recupera por HTTP un cobro confirmado con respuesta perdida sin duplicarlo', async () => {
    const event = await newEvent(),
      member = await join(event.id);
    const saved = new Map<string, string>();
    const store = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
      removeItem: (key: string) => {
        saved.delete(key);
      },
    };
    let lose = true;
    const transport = async (command: PendingEventRequest) => {
      const result = await agent.post(`/api${command.path}`).send(command.body);
      if (result.status >= 400) throw new ApiError(result.body.message, result.status);
      if (lose) {
        lose = false;
        throw new TypeError('Respuesta HTTP perdida después del commit');
      }
      return result.body;
    };
    const client = new EventRequests(store, transport);
    await expect(
      client.start(`/special-events/${event.id}/participants/${member.id}/movements`, 'POST', {
        expected_revision: (await eventDetail(event.id)).revision,
        kind: 'collection',
        amount: '25.10',
        date: '2089-12-01',
        recipient: 'hernan',
        method: 'transfer',
        notes: '',
      }),
    ).rejects.toThrow('perdida');
    const restored = new EventRequests(store, transport);
    await restored.retry();
    const detail = await eventDetail(event.id);
    expect(detail.movements).toHaveLength(1);
    expect(detail.gross).toBe('25.10');
    expect(saved.size).toBe(0);
  });

  it('numeración estable, concurrente, sin reutilización; eliminación vacía idempotente', async () => {
    const first = await newEvent(),
      number = (await eventDetail(first.id)).event_number;
    const body = { ...(await cmd(first.id)) };
    const deleted = await eventDelete(first.id, body);
    expect(await eventDelete(first.id, body)).toEqual(deleted);
    expect(await query('SELECT id FROM special_events WHERE id=?', [first.id])).toHaveLength(0);
    expect(await eventCreate(first.body)).toEqual({ id: first.id, revision: 1 });
    const [a, b] = await Promise.all([newEvent(), newEvent()]);
    const numbers = [
      (await eventDetail(a.id)).event_number,
      (await eventDetail(b.id)).event_number,
    ];
    expect(new Set(numbers).size).toBe(2);
    expect(Math.min(...numbers)).toBe(number + 1);
    const old = (await eventDetail(a.id)).event_number;
    await eventEdit(a.id, {
      ...eventFields,
      ...(await cmd(a.id)),
      date: eventFields.date.slice(0, 7) + '-01',
    });
    expect((await eventDetail(a.id)).event_number).toBe(old);
    const [dest] = await query('SELECT year,month FROM periods WHERE id=?', [p2]);
    const move = {
      ...(await cmd(a.id)),
      period_id: p2,
      date: dest.year + '-' + String(dest.month).padStart(2, '0') + '-01',
      start_time: '18:00',
      end_time: '20:00',
      reason: 'Nueva fecha',
    };
    const receipt = await eventReschedule(a.id, move);
    expect(await eventReschedule(a.id, move)).toEqual(receipt);
    expect((await eventDetail(b.id)).event_number).toBe(numbers[1]);
    expect((await newEvent()).id).toBeGreaterThan(b.id);
  });
  it('integra carteras separadas, históricos, gastos, cancelación atómica y MCP', async () => {
    const extra: number[] = [];
    let year = 2060;
    for (; year < 2070; year++) {
      if (!(await query('SELECT id FROM periods WHERE year=?', [year])).length) break;
    }
    expect(year).toBeLessThan(2070);
    for (const month of [1, 2, 3]) {
      const id = (await execute('INSERT INTO periods(year,month) VALUES (?,?)', [year, month]))
        .insertId;
      periodIds.push(id);
      extra.push(id);
    }
    const [january, february, march] = extra,
      jan = year + '-01',
      feb = year + '-02',
      mar = year + '-03';
    const event = await eventCreate({
      ...eventFields,
      period_id: february,
      date: feb + '-15',
      request_id: randomUUID(),
    });
    eventIds.push(event.id);
    const member = await join(event.id, person1, '80.10');
    await pay(event.id, member.id, '100.20');
    // Existing historical refund from a DIFFERENT receptor, plus an already voided payment.
    await execute(
      "INSERT INTO event_money_movements(participant_id,request_id,kind,date,amount,recipient,method,notes) VALUES (?,?,'refund',?,'20.10','hernan','cash','QA legacy')",
      [member.id, randomUUID(), jan + '-02'],
    );
    await execute(
      "INSERT INTO event_money_movements(participant_id,request_id,kind,date,amount,recipient,method,notes,voided_at,void_reason) VALUES (?,?,'collection',?,'999','hernan','cash','QA',UTC_TIMESTAMP(3),'QA error')",
      [member.id, randomUUID(), jan + '-01'],
    );
    await execute('INSERT INTO period_memberships(person_id,period_id) VALUES (?,?)', [
      person3,
      february,
    ]);
    const account = (
      await execute('INSERT INTO monthly_accounts(person_id,period_id,amount_due) VALUES (?,?,?)', [
        person3,
        february,
        '200',
      ])
    ).insertId;
    accountIds.push(account);
    await paymentSave({
      person_id: person3,
      period_id: february,
      date: feb + '-03',
      amount: '100',
      recipient: 'hernan',
      method: 'transfer',
    });
    const categoryName = randomUUID(),
      cat = (await expenseCategorySave(february, { name: categoryName })).id!;
    categoryIds.push(cat);
    const first = await eventExpenseSave(event.id, {
      ...(await cmd(event.id)),
      concept: 'Anticipo proveedor',
      date: jan + '-28',
      amount: '30.10',
      special_event_id: event.id,
      period_id: february,
      category_id: cat,
    });
    const second = await eventExpenseSave(event.id, {
      ...(await cmd(event.id)),
      concept: 'Materiales',
      date: feb + '-01',
      amount: '20.20',
      special_event_id: event.id,
      period_id: february,
      category_id: cat,
    });
    await expenseSave(february, cat, { concept: 'General', date: feb + '-02', amount: '40.00' });
    let dashboard = (await agent.get('/api/dashboard?period_id=' + february)).body;
    expect(dashboard).toMatchObject({
      paid: '100.00',
      due: '200.00',
      pending: '100.00',
      income_sources: {
        events: '80.10',
        total: '180.10',
        event_collections: '100.20',
        event_refunds: '20.10',
      },
      wallets: {
        jesica: { total: '0.00' },
        hernan: { cash: '0.00', transfer: '100.00', total: '100.00' },
      },
    });
    expect(dashboard.events[0]).toMatchObject({
      collections: '100.20',
      refunds: '20.10',
      effective_net: '80.10',
      recorded: {
        collections: '1099.20',
        refunds: '20.10',
        voided_collections: '999.00',
        voided_refunds: '0.00',
        excluded_valid_net: '0.00',
      },
      commercial: { due: '80.10', gross: '80.10', balance: '0.00' },
      wallets: { jesica: { transfer: '80.10', total: '80.10' }, hernan: { total: '0.00' } },
    });
    expect((await agent.get('/api/dashboard?period_id=' + january)).body.income_sources.total).toBe(
      '0.00',
    );
    expect((await statisticsSummary(february)).metrics.expenses.value).toBe('90.30');
    expect((await statisticsExpenseBreakdown(february)).total).toBe('90.30');
    expect((await monthlyContext(feb)).version).toBe('2.0');
    expect(JSON.stringify(await eventsContext(feb))).not.toMatch(
      /person_id|apellido|telefono|notes|movements/,
    );
    await expect(expenseDelete(february, cat, first.id)).rejects.toMatchObject({ status: 409 });
    await expect(expenseCategoryDelete(february, cat)).rejects.toMatchObject({ status: 409 });
    const move = {
      ...(await cmd(event.id)),
      period_id: march,
      date: mar + '-15',
      start_time: '18:00',
      end_time: '20:00',
      reason: 'Nueva fecha',
    };
    await eventReschedule(event.id, move);
    expect((await eventDetail(event.id)).expenses?.map((e) => [e.id, e.period_id])).toEqual([
      [first.id, february],
      [second.id, february],
    ]);
    expect((await statisticsSummary(february)).metrics.expenses.value).toBe('90.30');
    expect((await statisticsSummary(march)).metrics.expenses.value).toBe('0.00');
    expect(
      (await agent.get('/api/dashboard?period_id=' + february)).body.income_sources.total,
    ).toBe('100.00');
    expect((await agent.get('/api/dashboard?period_id=' + march)).body.income_sources.total).toBe(
      '80.10',
    );
    const before = await eventDetail(event.id),
      deletion = { ...(await cmd(event.id)), reason: 'Cancelación QA' };
    await expect(eventDelete(event.id, deletion)).rejects.toThrow('Falta la categoría');
    expect(await eventDetail(event.id)).toEqual(before);
    const destination = (await expenseCategorySave(january, { name: categoryName })).id!;
    categoryIds.push(destination);
    await execute("UPDATE periods SET status='closed' WHERE id IN (?,?)", [january, february]);
    const preview = await agent.get('/api/special-events/' + event.id + '/deletion-preview');
    expect(preview.status).toBe(200);
    expect(preview.body.reopen_periods.map((p: any) => p.id)).toEqual([january, february]);
    await expect(eventDelete(event.id, deletion)).rejects.toMatchObject({
      status: 409,
      details: { reopen_periods: expect.any(Array) },
    });
    expect(await eventDetail(event.id)).toEqual(before);
    // Failure after the first expense update rolls back expense moves AND temporary reopening.
    const { peopleTransaction } = await import('../server/db');
    const { detachCancellationExpenses } = await import('../server/event-expenses');
    await expect(
      peopleTransaction(async (db) => {
        let writes = 0;
        const failing = {
          execute: async (sql: any, values: any) => {
            if (String(sql).startsWith('UPDATE period_expenses') && ++writes === 2)
              throw Error('Fallo controlado');
            return db.execute(sql, values);
          },
        } as any;
        await detachCancellationExpenses(event.id, [january, february], failing);
      }),
    ).rejects.toThrow('Fallo controlado');
    expect((await query('SELECT status FROM periods WHERE id=?', [january]))[0].status).toBe(
      'closed',
    );
    expect((await query('SELECT status FROM periods WHERE id=?', [february]))[0].status).toBe(
      'closed',
    );
    expect(await eventDetail(event.id)).toEqual(before);
    const approved = { ...deletion, reopen_period_ids: [january, february] };
    const receipt = await eventDelete(event.id, approved);
    expect(await eventDelete(event.id, approved)).toEqual(receipt);
    expect((await query('SELECT status FROM periods WHERE id=?', [january]))[0].status).toBe(
      'closed',
    );
    expect(
      (
        await query(
          'SELECT category_id,special_event_id,date,amount FROM period_expenses WHERE id=?',
          [first.id],
        )
      )[0],
    ).toEqual({
      category_id: destination,
      special_event_id: null,
      date: jan + '-28',
      amount: '30.10',
    });
    expect(
      (
        await query('SELECT category_id,special_event_id FROM period_expenses WHERE id=?', [
          second.id,
        ])
      )[0],
    ).toEqual({ category_id: cat, special_event_id: null });
    expect((await statisticsSummary(january)).metrics.expenses.value).toBe('30.10');
    expect((await statisticsSummary(february)).metrics.expenses.value).toBe('60.20');
    dashboard = (await agent.get('/api/dashboard?period_id=' + march)).body;
    expect(dashboard.events).toEqual([]);
    expect(dashboard.income_sources.total).toBe('0.00');
    const cancelled = (await eventsContext(mar)).events[0];
    expect(cancelled).toMatchObject({
      name: eventFields.name,
      status: 'cancelled',
      commercial: null,
      cancelled_participants: 1,
      cancellation_reason: 'Cancelación QA',
    });
    expect(
      (await query('SELECT amount_due FROM monthly_accounts WHERE id=?', [account]))[0].amount_due,
    ).toBe('200.00');
  });
  it('cancelar no inventa períodos faltantes ni deja una cancelación parcial', async () => {
    const event = await newEvent();
    const member = await join(event.id);
    await pay(event.id, member.id, '12');
    let year = 2050;
    while ((await query('SELECT id FROM periods WHERE year=? AND month=1', [year])).length) year++;
    const cat = (await expenseCategorySave(p1, { name: randomUUID() })).id!;
    categoryIds.push(cat);
    await eventExpenseSave(event.id, {
      ...(await cmd(event.id)),
      concept: 'Gasto anterior',
      date: year + '-01-01',
      amount: '1',
      special_event_id: event.id,
      period_id: p1,
      category_id: cat,
    });
    const before = await eventDetail(event.id);
    await expect(eventDelete(event.id, { ...(await cmd(event.id)) })).rejects.toThrow(
      'Falta crear el período',
    );
    expect(await eventDetail(event.id)).toEqual(before);
    expect(await query('SELECT id FROM periods WHERE year=? AND month=1', [year])).toHaveLength(0);
  });
  it('normaliza correcciones de cobros legacy sin usar el receptor de reintegro', async () => {
    const event = await newEvent(),
      member = await join(event.id),
      payment = await pay(event.id, member.id, '100');
    await execute(
      "INSERT INTO event_money_movements(participant_id,request_id,kind,date,amount,recipient,method,notes) VALUES (?,?,'refund',?,'20','hernan','cash','QA legacy')",
      [member.id, randomUUID(), eventFields.date],
    );
    await eventMovementEdit(event.id, payment.id, {
      ...(await cmd(event.id)),
      kind: 'collection',
      date: eventFields.date,
      amount: '70',
      recipient: 'hernan',
      method: 'transfer',
    });
    expect((await eventDetail(event.id)).gross).toBe('70.00');
    const row = (await readEventEconomy(p1, pool)).events.find((e) => e.id === event.id)!;
    expect(row.wallets).toEqual({
      jesica: { cash: '0.00', transfer: '0.00', total: '0.00' },
      hernan: { cash: '0.00', transfer: '70.00', total: '70.00' },
    });
    await eventMovementVoid(event.id, payment.id, { ...(await cmd(event.id)), reason: 'Error' });
    expect((await eventDetail(event.id)).gross).toBe('0.00');
  });
  it('evento gratuito conserva precios individuales; eliminación de gasto mantiene antecedente', async () => {
    const event = await eventCreate({
      ...eventFields,
      period_id: p1,
      price: '0',
      request_id: randomUUID(),
    });
    eventIds.push(event.id);
    await join(event.id, person1, '0');
    expect(await eventDetail(event.id)).toMatchObject({
      due: '0.00',
      gross: '0.00',
      pending: '0.00',
    });
    const cat = (await expenseCategorySave(p1, { name: randomUUID() })).id!;
    categoryIds.push(cat);
    const expense = await eventExpenseSave(event.id, {
      ...(await cmd(event.id)),
      concept: 'QA',
      date: eventFields.date,
      amount: '10',
      special_event_id: event.id,
      period_id: p1,
      category_id: cat,
    });
    const deletion = { ...(await cmd(event.id)), reason: 'Error' };
    const receipt = await eventExpenseVoid(event.id, expense.id, deletion);
    expect(await eventExpenseVoid(event.id, expense.id, deletion)).toEqual(receipt);
    expect((await eventDetail(event.id)).direct_expenses).toBe('0.00');
    expect(
      (await query('SELECT voided_at FROM period_expenses WHERE id=?', [expense.id]))[0].voided_at,
    ).toBeTruthy();
  });
  it('reconcilia API real y transporte MCP, múltiples eventos y exclusión sin reintegro inventado', async () => {
    const baseline = (await readEventEconomy(p1, pool)).income;
    const one = await newEvent(),
      two = await newEvent();
    const member = await join(one.id),
      other = await join(two.id, person2, '60');
    await pay(one.id, member.id, '100.20');
    await pay(two.id, other.id, '30.20');
    await execute(
      "INSERT INTO event_money_movements(participant_id,request_id,kind,date,amount,recipient,method,notes) VALUES (?,?,'refund',?,'20.10','hernan','cash','QA legado')",
      [member.id, randomUUID(), eventFields.date],
    );
    const [period] = await query('SELECT year,month FROM periods WHERE id=?', [p1]);
    const month = period.year + '-' + String(period.month).padStart(2, '0');
    const token = 'a'.repeat(64);
    const app = createApp(
      {},
      { tokenHash: createHash('sha256').update(token).digest('hex'), allowLocalHttp: true },
    );
    const response = await request(app)
      .get('/api/integrations/ai/events-context?period=' + month)
      .set('Authorization', 'Bearer ' + token);
    expect(response.status).toBe(200);
    const transportPath = 'C:/dev/personal/prisma-mcp/prisma-site/lib/events-transport.mjs';
    const { fetchEventsContext } = await import(transportPath);
    const transported = await fetchEventsContext(month, token, async () =>
      Response.json(response.body),
    );
    expect(transported).toEqual(response.body);
    const row = transported.events.find((e: any) => e.id === one.id);
    expect(row).toMatchObject({
      collections: '100.20',
      refunds: '20.10',
      effective_net: '80.10',
      commercial: { gross: '80.10', due: '100.20', pending: '20.10' },
    });
    const { Decimal } = await import('decimal.js');
    expect(transported.income.events).toBe(new Decimal(baseline.events).plus('110.30').toFixed(2));
    expect(
      transported.events
        .reduce((sum: any, e: any) => sum.plus(e.collections), new Decimal(0))
        .toFixed(2),
    ).toBe(transported.income.event_collections);
    expect(
      transported.events
        .reduce((sum: any, e: any) => sum.plus(e.refunds), new Decimal(0))
        .toFixed(2),
    ).toBe(transported.income.event_refunds);
    await eventParticipantEdit(one.id, member.id, {
      ...(await cmd(one.id)),
      active: false,
      price: '100.20',
    });
    const excluded = (await readEventEconomy(p1, pool)).events.find((e) => e.id === one.id)!;
    expect(excluded).toMatchObject({
      collections: '0.00',
      refunds: '0.00',
      effective_net: '0.00',
      recorded: {
        administratively_excluded_collections: '100.20',
        administratively_excluded_refunds: '20.10',
      },
    });
    expect(
      (
        await query(
          "SELECT COUNT(*) n FROM event_money_movements WHERE participant_id=? AND kind='refund'",
          [member.id],
        )
      )[0].n,
    ).toBe(1);
    await join(one.id);
    expect((await eventDetail(one.id)).gross).toBe('0.00');
    await pay(one.id, member.id, '10');
    await eventDelete(one.id, { ...(await cmd(one.id)) });
    const cancelled = (await readEventEconomy(p1, pool)).events.find((e) => e.id === one.id)!;
    expect(cancelled).toMatchObject({
      commercial: null,
      collections: '0.00',
      refunds: '0.00',
      effective_net: '0.00',
      recorded: { excluded_valid_net: '10.00' },
    });
  });
  it('rollback tras insertar dinero permite reintento con la misma clave sin duplicar', async () => {
    const event = await newEvent(),
      member = await join(event.id),
      before = await eventDetail(event.id);
    const { eventMovementSchema } = await import('../shared/special-events');
    const body = eventMovementSchema.parse({
      ...(await cmd(event.id)),
      kind: 'collection',
      date: eventFields.date,
      amount: '12.34',
      recipient: 'jesica',
      method: 'cash',
    });
    await expect(
      command(event.id, 'movement-add:' + member.id, body, async (_event, db) => {
        await execute(
          "INSERT INTO event_money_movements(participant_id,request_id,kind,date,amount,recipient,method,notes) VALUES (?,?,'collection',?,'12.34','jesica','cash','QA')",
          [member.id, body.request_id, body.date],
          db,
        );
        throw Error('Fallo controlado posterior al cobro');
      }),
    ).rejects.toThrow('posterior al cobro');
    expect(await eventDetail(event.id)).toEqual(before);
    expect(
      await query('SELECT id FROM event_money_movements WHERE request_id=?', [body.request_id]),
    ).toHaveLength(0);
    const [a, b] = await Promise.all([
      eventMovementAdd(event.id, member.id, body),
      eventMovementAdd(event.id, member.id, body),
    ]);
    expect(a).toEqual(b);
    expect((await eventDetail(event.id)).gross).toBe('12.34');
    expect(
      await query('SELECT id FROM event_money_movements WHERE request_id=?', [body.request_id]),
    ).toHaveLength(1);
  });
});
