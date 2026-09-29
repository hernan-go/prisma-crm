import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query } from '../server/db.js';
import { wallet } from '../shared/domain.js';

// Shares the integration suite's guarded prisma_test lifecycle; no production data or seeds.
export function formsFinanceTests(agent: any, password: string) {
  describe('Forms: cuenta manual y pago inicial atómicos', () => {
    let period: number,
      activity: number,
      schedule: number,
      serial = 0;
    const post = async (path: string, body: any) => {
      const r = await agent.post('/api' + path).send(body);
      expect(r.status, r.body.message).toBe(201);
      return r.body.id;
    };
    const row = (amount_due = '', payment: Record<string, unknown> = {}) => ({
      person: {
        nombre: 'Finanzas',
        apellido: `Sintética ${++serial}`,
        telefono: `0000088${String(serial).padStart(4, '0')}`,
      },
      action: 'create',
      reviewed: true,
      amount_due,
      selections: [
        {
          original: '',
          include: true,
          activity_id: activity,
          schedule_id: schedule,
          day: 1,
          start: '09:00',
          end: '10:00',
          instructor_ids: [],
        },
      ],
      payment: { amount: '', method: '', date: '', include: false, ...payment },
    });
    const pay = (amount: string, method = 'transfer') => ({
      include: true,
      amount,
      method,
      date: '2032-01-15',
    });
    const body = (rows: any[], request_id: string = randomUUID()) => ({
      period_id: period,
      request_id,
      confirmed: true,
      rows,
    });
    const commit = (rows: any[], requestId?: string) =>
      agent.post('/api/forms-import/commit').send(body(rows, requestId));
    const account = async (r: ReturnType<typeof row>) => {
      const [p] = await query('SELECT id FROM people WHERE telefono=?', [r.person.telefono]);
      const result = await agent.get(`/api/accounts?period_id=${period}&person_id=${p.id}`);
      expect(result.status).toBe(200);
      return result.body[0];
    };
    const existing = async (amount = '35000') => {
      const r = row(amount);
      expect((await commit([r])).status).toBe(200);
      const a = await account(r);
      return { ...r, action: 'keep', target_id: a.person_id };
    };
    const snapshot = async () => {
      const tables = [
        'people',
        'enrollments',
        'enrollment_slots',
        'monthly_accounts',
        'payments',
        'import_receipts',
      ];
      return Promise.all(tables.map((t) => query(`SELECT * FROM ${t} ORDER BY id`)));
    };
    beforeAll(async () => {
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
      period = await post('/periods', { year: 2032, month: 1 });
      activity = await post('/activities', {
        name: 'Finanzas Forms sintética',
        mode: 'group',
        days: [1],
      });
      const offering = await post('/offerings', {
        period_id: period,
        activity_id: activity,
        mode: 'group',
        days: [1],
      });
      schedule = await post('/schedules', {
        offering_id: offering,
        day: 1,
        start: '09:00',
        end: '10:00',
        instructor_ids: [],
      });
    });
    it('preview ignora importes y pagos del CSV incluso con mapping financiero antiguo', async () => {
      const before = await snapshot();
      const r = await agent
        .post('/api/forms-import/preview')
        .field('period_id', String(period))
        .field(
          'mapping',
          JSON.stringify({ nombre: 0, apellido: 1, telefono: 2, amount_due: 3, payment: 4 }),
        )
        .attach(
          'file',
          Buffer.from(
            'Nombre;Apellido;Teléfono;A cobrar;Pago\nManual;Sintética;0000088999;35000;20000 T 15/1',
          ),
          'synthetic.csv',
        );
      expect(r.status).toBe(200);
      expect(r.body.rows[0]).toMatchObject({
        amount_due: '',
        payment: { include: false, amount: '', method: '', date: '' },
      });
      expect(r.body.mapping).not.toHaveProperty('amount_due');
      expect(r.body.rows[0].payment).not.toHaveProperty('approved');
      expect(await snapshot()).toEqual(before);
    });
    it('inscripción con importe vacío crea cuenta indefinida y ningún pago', async () => {
      const r = row();
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toMatchObject({ amount_due: null, paid: '0.00', balance: null });
    });
    it('contacto sin inscripción ni finanzas no crea cuenta', async () => {
      const r = row();
      r.selections = [];
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toBeUndefined();
    });
    it('35000 sin pago crea deuda por 35000', async () => {
      const r = row('35000');
      const result = await commit([r]);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ created: 1, enrollments: 1, payments: 0 });
      expect(await account(r)).toMatchObject({
        amount_due: '35000.00',
        paid: '0.00',
        balance: '35000.00',
      });
    });
    it.each([
      ['20000', 'transfer', '15000.00', 'Hernán'],
      ['35000', 'cash', '0.00', 'Jesica'],
      ['40000', 'transfer', '-5000.00', 'Hernán'],
    ])(
      'pago %s %s conserva movimiento independiente y saldo %s',
      async (amount, method, balance, cartera) => {
        const r = row('35000', pay(amount, method));
        expect((await commit([r])).status).toBe(200);
        const a = await account(r);
        expect(a).toMatchObject({ amount_due: '35000.00', paid: amount + '.00', balance });
        const payments = await query('SELECT * FROM payments WHERE account_id=?', [a.id]);
        expect(payments).toHaveLength(1);
        expect(payments[0]).toMatchObject({ amount: amount + '.00', method, date: '2032-01-15' });
        expect(wallet(payments[0].method)).toBe(cartera);
      },
    );
    it('vacío conserva importe existente al conservar persona e inscripciones', async () => {
      const r = await existing();
      r.amount_due = '';
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toMatchObject({
        amount_due: '35000.00',
        paid: '0.00',
        balance: '35000.00',
      });
    });
    it('update aplica nuevo importe y permite persistir cero sin borrar pagos', async () => {
      const r = await existing();
      r.action = 'update';
      r.amount_due = '42000.50';
      r.person.nombre = 'Finanzas editada';
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toMatchObject({
        amount_due: '42000.50',
        nombre: 'Finanzas editada',
      });
      r.action = 'keep';
      r.amount_due = '0';
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toMatchObject({ amount_due: '0.00', balance: '0.00' });
    });
    it('importe definido sin inscripción crea la cuenta normalmente', async () => {
      const r = row('0');
      r.selections = [];
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toMatchObject({ amount_due: '0.00', paid: '0.00' });
    });
    it('pago sin importe definido conserva cuenta indefinida', async () => {
      const r = row('', pay('100'));
      r.selections = [];
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toMatchObject({ amount_due: null, paid: '100.00', balance: null });
    });
    it('pago excluido ignora datos residuales inválidos', async () => {
      const r = row('35000', {
        include: false,
        amount: 'residual',
        method: 'otro',
        date: 'inválida',
      });
      expect((await commit([r])).status).toBe(200);
      expect(await account(r)).toMatchObject({ amount_due: '35000.00', paid: '0.00' });
    });
    it('pago incluido inválido y A cobrar inválido rechazan el lote sin escrituras', async () => {
      const before = await snapshot();
      for (const payment of [
        { amount: '', method: 'cash', date: '2032-01-15' },
        { amount: '1', method: 'otro', date: '2032-01-15' },
        { amount: '1', method: 'cash', date: '2032-02-30' },
      ]) {
        expect((await commit([row('35000', { ...payment, include: true })])).status).toBe(422);
      }
      expect((await commit([row('-1')])).status).toBe(422);
      expect(await snapshot()).toEqual(before);
    });
    it('skip no modifica persona, inscripción, cuenta ni pago', async () => {
      const r = await existing();
      r.action = 'skip';
      r.amount_due = '99999';
      r.payment = { ...r.payment, ...pay('20000') };
      const before = await snapshot();
      const result = await commit([r]);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        skipped: 1,
        created: 0,
        updated: 0,
        kept: 0,
        enrollments: 0,
        payments: 0,
      });
      // A receipt for the processed request is expected; all operational tables stay unchanged.
      expect((await snapshot()).slice(0, 5)).toEqual(before.slice(0, 5));
    });
    it('duplicado de pago revierte también el nuevo importe y filas anteriores', async () => {
      const r = row('35000', pay('20000'));
      expect((await commit([r])).status).toBe(200);
      const a = await account(r);
      const duplicate = { ...r, action: 'keep', target_id: a.person_id, amount_due: '99999' };
      const before = await snapshot();
      const result = await commit([row('35000', pay('10')), duplicate]);
      expect(result.status).toBe(409);
      expect(result.body.message).toContain('Ya hay un pago');
      expect(await snapshot()).toEqual(before);
    });
    it('fallo intermedio revierte personas, inscripciones, importe existente, pago y receipt', async () => {
      const first = await existing();
      first.amount_due = '99999';
      first.payment = { ...first.payment, ...pay('100') };
      const invalid = row('35000', pay('20'));
      invalid.selections[0].schedule_id = 2147483647;
      const before = await snapshot();
      const result = await commit([
        first,
        row('35000', pay('10')),
        invalid,
        row('35000', pay('30')),
      ]);
      expect(result.status).toBe(409);
      expect(await snapshot()).toEqual(before);
    });
    it('request_id es idempotente e incluye importe y pago en el hash', async () => {
      const r = row('35000', pay('20000'));
      const requestId = randomUUID();
      const first = await commit([r], requestId);
      expect(first.status).toBe(200);
      const before = await snapshot();
      const retry = await commit([r], requestId);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(first.body);
      expect(await snapshot()).toEqual(before);
      expect((await commit([{ ...r, amount_due: '36000' }], requestId)).status).toBe(409);
      expect(
        (await commit([{ ...r, payment: { ...r.payment, amount: '21000' } }], requestId)).status,
      ).toBe(409);
      expect(await snapshot()).toEqual(before);
    });
    it('pago posterior normal suma otro movimiento y perfil puede quitar importe', async () => {
      const r = row('35000', pay('20000'));
      expect((await commit([r])).status).toBe(200);
      const a = await account(r);
      await post('/payments', {
        person_id: a.person_id,
        period_id: period,
        date: '2032-01-16',
        amount: '15000',
        method: 'cash',
      });
      expect(await account(r)).toMatchObject({ paid: '35000.00', balance: '0.00' });
      expect(await query('SELECT id FROM payments WHERE account_id=?', [a.id])).toHaveLength(2);
      expect(
        (
          await agent
            .put('/api/accounts')
            .send({ person_id: a.person_id, period_id: period, amount_due: null })
        ).status,
      ).toBe(200);
      expect(await account(r)).toMatchObject({ amount_due: null, paid: '35000.00', balance: null });
    });
  });
}
