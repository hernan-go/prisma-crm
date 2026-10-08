import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { execute, pool, query } from '../server/db.js';
import { migrate } from '../server/migrate.js';

export async function verifyPaymentMigration() {
  if (
    process.env.DB_NAME !== 'prisma_test' ||
    (await query('SELECT DATABASE() name'))[0].name !== 'prisma_test'
  )
    throw new Error('Only prisma_test');
  const [closed] = await query("SELECT id FROM periods WHERE status='closed' LIMIT 1");
  const [existing] = await query('SELECT person_id FROM monthly_accounts LIMIT 1');
  await execute('INSERT INTO period_memberships(person_id,period_id) VALUES (?,?)', [
    existing.person_id,
    closed.id,
  ]);
  const closedAccount = (
    await execute('INSERT INTO monthly_accounts(person_id,period_id) VALUES (?,?)', [
      existing.person_id,
      closed.id,
    ])
  ).insertId;
  await execute('UPDATE people SET activo=0 WHERE id=?', [existing.person_id]);
  await execute(
    "INSERT INTO payments(account_id,date,amount,method,notes) VALUES (?,'2033-01-02',12.34,'cash','Histórico cerrado'),(?,'2033-01-03',56.78,'transfer','Histórico archivado')",
    [closedAccount, closedAccount],
  );
  await execute(
    "UPDATE payments SET created_at='2021-02-03 04:05:06',updated_at='2022-03-04 05:06:07'",
  );
  const before = await query('SELECT * FROM payments ORDER BY id');
  const accounts = await query('SELECT * FROM monthly_accounts ORDER BY id');
  const totals = () =>
    query(`SELECT m.period_id,SUM(p.amount) paid,
    SUM(IF(p.method='cash',p.amount,0)) cash,SUM(IF(p.method='transfer',p.amount,0)) transfer
    FROM payments p JOIN monthly_accounts m ON m.id=p.account_id GROUP BY m.period_id`);
  const originalTotals = await totals();
  expect(before).toHaveLength(4);
  expect(before.reduce((sum, p) => sum.plus(p.amount), new Decimal(0)).toFixed(2)).toBe('50069.12');
  const unrelated = await Promise.all(
    [
      'people',
      'periods',
      'period_memberships',
      'enrollments',
      'enrollment_slots',
      'import_receipts',
    ].map((t) => query(`SELECT * FROM ${t} ORDER BY id`)),
  );
  // Unexpected partial schemas and data must stop before changing historical values.
  await execute('ALTER TABLE payments ADD COLUMN recipient VARCHAR(12) NULL');
  await expect(migrate()).rejects.toThrow('chk_009_preflight');
  await execute('ALTER TABLE payments DROP COLUMN recipient');
  await execute(
    'ALTER TABLE payments ADD COLUMN recipient VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NULL',
  );
  await execute("UPDATE payments SET recipient='otro',updated_at=updated_at WHERE id=?", [
    before[0].id,
  ]);
  const invalid = await query('SELECT * FROM payments ORDER BY id');
  await expect(migrate()).rejects.toThrow('chk_009_preflight');
  expect(await query('SELECT * FROM payments ORDER BY id')).toEqual(invalid);
  await execute('ALTER TABLE payments DROP COLUMN recipient');
  for (const stage of ['backfill', 'not_null', 'registration']) {
    const connection = await pool.getConnection();
    const original = connection.query.bind(connection);
    const spy = vi.spyOn(connection, 'query').mockImplementation((async (...args: any[]) => {
      const sql = String(args[0]);
      if (
        (stage === 'backfill' && /UPDATE payments\s+SET recipient=/.test(sql)) ||
        (stage === 'not_null' &&
          sql.trim().startsWith('SET @recipient_ddl') &&
          sql.includes("IS_NULLABLE='NO'")) ||
        (stage === 'registration' && sql.includes("IS_NULLABLE='NO' AND COLUMN_DEFAULT IS NULL"))
      )
        throw new Error(`Fallo sintético 009 ${stage}`);
      return (original as any)(...args);
    }) as any);
    const acquire = vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    try {
      await expect(migrate()).rejects.toThrow(`Fallo sintético 009 ${stage}`);
    } finally {
      spy.mockRestore();
      acquire.mockRestore();
    }
    expect(await query("SELECT name FROM schema_migrations WHERE name='009.sql'")).toEqual([]);
    const partial = await query('SELECT * FROM payments ORDER BY id');
    expect(partial.map(({ recipient: _recipient, ...rest }) => rest)).toEqual(before);
    if (stage === 'backfill') expect(partial.every((p) => p.recipient === null)).toBe(true);
    else
      expect(partial.map((p) => p.recipient)).toEqual(
        before.map((p) => (p.method === 'cash' ? 'jesica' : 'hernan')),
      );
    await migrate();
    expect((await query("SELECT name FROM schema_migrations WHERE name='009.sql'")).length).toBe(1);
    const after = await query('SELECT * FROM payments ORDER BY id');
    expect(after.map(({ recipient: _recipient, ...rest }) => rest)).toEqual(before);
    expect(after.map((p) => p.recipient)).toEqual(
      before.map((p) => (p.method === 'cash' ? 'jesica' : 'hernan')),
    );
    expect(await totals()).toEqual(originalTotals);
    expect(await query('SELECT * FROM monthly_accounts ORDER BY id')).toEqual(accounts);
    expect(
      await Promise.all(
        [
          'people',
          'periods',
          'period_memberships',
          'enrollments',
          'enrollment_slots',
          'import_receipts',
        ].map((t) => query(`SELECT * FROM ${t} ORDER BY id`)),
      ),
    ).toEqual(unrelated);
    const wallets = await query(`SELECT m.period_id,
      SUM(IF(p.recipient='jesica',p.amount,0)) cash,
      SUM(IF(p.recipient='hernan',p.amount,0)) transfer,SUM(p.amount) paid
      FROM payments p JOIN monthly_accounts m ON m.id=p.account_id GROUP BY m.period_id`);
    expect(wallets).toEqual(originalTotals);
    await execute("DELETE FROM schema_migrations WHERE name='009.sql'");
    await migrate();
    await migrate();
    expect(await query('SELECT * FROM payments ORDER BY id')).toEqual(after);
    if (stage !== 'registration') {
      await execute('ALTER TABLE payments DROP CHECK chk_payment_recipient');
      await execute('ALTER TABLE payments DROP COLUMN recipient');
      await execute("DELETE FROM schema_migrations WHERE name='009.sql'");
    }
  }
  expect(
    (
      await query(`SELECT IS_NULLABLE nullable,COLUMN_DEFAULT default_value,COLLATION_NAME collation
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='recipient'`)
    )[0],
  ).toMatchObject({ nullable: 'NO', default_value: null, collation: 'ascii_bin' });
  const account = before[0].account_id;
  for (const recipient of [null, '', 'otro', 'JESICA'])
    await expect(
      execute(
        "INSERT INTO payments(account_id,date,amount,method,recipient,notes) VALUES (?,'2026-09-01',1,'cash',?,'')",
        [account, recipient],
      ),
    ).rejects.toThrow();
  await expect(
    execute(
      "INSERT INTO payments(account_id,date,amount,method,notes) VALUES (?,'2026-09-01',1,'cash','')",
      [account],
    ),
  ).rejects.toThrow();
}

export function paymentTests(agent: any, password: string) {
  describe('Cobros: receptor y medio independientes', () => {
    let period: number, person: number, payment: number;
    const base = () => ({
      person_id: person,
      period_id: period,
      date: '2051-01-02',
      amount: '10.25',
      method: 'cash',
      recipient: 'jesica',
    });
    const snapshot = () =>
      Promise.all(
        ['people', 'period_memberships', 'monthly_accounts', 'payments', 'import_receipts'].map(
          (t) => query(`SELECT * FROM ${t} ORDER BY id`),
        ),
      );
    const formRow = () => ({
      person: { nombre: 'Receptor', apellido: 'Sintético', telefono: '0000099001' },
      action: 'keep',
      target_id: person,
      reviewed: true,
      selections: [],
      amount_due: '',
      payment: {
        amount: '2.50',
        method: 'transfer',
        recipient: 'jesica',
        date: '2051-01-03',
        include: true,
      },
    });
    const commit = (rows: unknown[], request_id = randomUUID()) =>
      agent
        .post('/api/forms-import/commit')
        .send({ period_id: period, request_id, confirmed: true, rows });
    beforeAll(async () => {
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
      person = (
        await agent
          .post('/api/people')
          .send({ nombre: 'Receptor', apellido: 'Sintético', telefono: '0000099001' })
      ).body.id;
      period = (await agent.post('/api/periods').send({ year: 2051, month: 1 })).body.id;
      expect(
        (await agent.post(`/api/periods/${period}/memberships`).send({ person_id: person })).status,
      ).toBe(201);
      expect(
        (
          await agent
            .put('/api/accounts')
            .send({ person_id: person, period_id: period, amount_due: '30' })
        ).status,
      ).toBe(200);
    });
    it.each([
      ['jesica', 'cash'],
      ['jesica', 'transfer'],
      ['hernan', 'cash'],
      ['hernan', 'transfer'],
    ])('crea %s / %s', async (recipient, method) => {
      const r = await agent.post('/api/payments').send({ ...base(), recipient, method });
      expect(r.status).toBe(201);
      payment = r.body.id;
      expect((await query('SELECT * FROM payments WHERE id=?', [payment]))[0]).toMatchObject({
        recipient,
        method,
        amount: '10.25',
      });
    });
    it('reconcilia cuatro subtotales, carteras, cobrado y sobrepago', async () => {
      const d = (await agent.get(`/api/dashboard?period_id=${period}`)).body;
      expect(d.wallets).toEqual({
        jesica: { cash: '10.25', transfer: '10.25', total: '20.50' },
        hernan: { cash: '10.25', transfer: '10.25', total: '20.50' },
      });
      expect(new Decimal(d.wallets.jesica.total).plus(d.wallets.hernan.total).toFixed(2)).toBe(
        d.paid,
      );
      expect(d).toMatchObject({ due: '30.00', paid: '41.00', pending: '0.00', credit: '11.00' });
    });
    it.each([undefined, null, '', 'otro', 'Jésica', 'JESICA'])(
      'rechaza receptor %j sin escrituras',
      async (recipient) => {
        const before = await snapshot();
        expect((await agent.post('/api/payments').send({ ...base(), recipient })).status).toBe(422);
        expect(await snapshot()).toEqual(before);
      },
    );
    it('edita receptor sin alterar medio y medio sin alterar receptor', async () => {
      expect(
        (
          await agent
            .put(`/api/payments/${payment}`)
            .send({ ...base(), recipient: 'jesica', method: 'transfer' })
        ).status,
      ).toBe(200);
      expect(
        (await query('SELECT recipient,method FROM payments WHERE id=?', [payment]))[0],
      ).toEqual({ recipient: 'jesica', method: 'transfer' });
      expect(
        (
          await agent
            .put(`/api/payments/${payment}`)
            .send({ ...base(), recipient: 'jesica', method: 'cash' })
        ).status,
      ).toBe(200);
      expect(
        (await query('SELECT recipient,method FROM payments WHERE id=?', [payment]))[0],
      ).toEqual({ recipient: 'jesica', method: 'cash' });
      expect((await agent.get(`/api/accounts?period_id=${period}`)).body[0]).toMatchObject({
        amount_due: '30.00',
        paid: '41.00',
        balance: '-11.00',
      });
      expect(
        (await agent.get(`/api/people/${person}`)).body.payments.find((p: any) => p.id === payment),
      ).toMatchObject({ recipient: 'jesica', method: 'cash' });
    });
    it('reintentar SQL completo no reclasifica combinaciones nuevas', async () => {
      const before = await snapshot();
      await execute("DELETE FROM schema_migrations WHERE name='009.sql'");
      await migrate();
      expect(await snapshot()).toEqual(before);
    });
    it('Forms requiere receptor nuevo y conserva duplicados independientemente del receptor', async () => {
      const row = formRow();
      const requestId = randomUUID();
      expect((await commit([{ ...row, payment: { ...row.payment, recipient: '' } }])).status).toBe(
        422,
      );
      expect(
        (await commit([{ ...row, payment: { ...row.payment, recipient: 'otro' } }])).status,
      ).toBe(422);
      const { recipient: _recipient, ...missingRecipient } = row.payment;
      expect((await commit([{ ...row, payment: missingRecipient }])).status).toBe(422);
      const first = await commit([row], requestId);
      expect(first.status).toBe(200);
      const before = await snapshot();
      expect((await commit([row], requestId)).body).toEqual(first.body);
      const changed = { ...row, payment: { ...row.payment, recipient: 'hernan' } };
      expect((await commit([changed], requestId)).status).toBe(409);
      expect((await commit([changed])).status).toBe(409);
      expect(await snapshot()).toEqual(before);
    });
    it('reconoce receipt anterior sin receptor, sin reescribir hash ni operaciones', async () => {
      const { recipient: _recipient, ...oldPayment } = formRow().payment;
      const oldRow = { ...formRow(), payment: oldPayment };
      const requestId = randomUUID();
      const result = { created: 0, updated: 0, kept: 1, skipped: 0, enrollments: 0, payments: 1 };
      // Independently assembled pre-009 canonical object, not the compatibility helper.
      const hash = createHash('sha256')
        .update(JSON.stringify({ period, rows: [oldRow] }))
        .digest('hex');
      await execute('INSERT INTO import_receipts(id,payload_hash,result) VALUES (?,?,?)', [
        requestId,
        hash,
        JSON.stringify(result),
      ]);
      const before = await snapshot();
      const retry = await commit([oldRow], requestId);
      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(result);
      expect(
        (await commit([{ ...oldRow, payment: { ...oldPayment, amount: '3' } }], requestId)).status,
      ).toBe(409);
      expect((await commit([formRow()], requestId)).status).toBe(409);
      expect((await commit([oldRow])).status).toBe(422);
      expect(await snapshot()).toEqual(before);
    });
    it('período cerrado bloquea alta, edición y baja sin modificar movimientos', async () => {
      await agent.patch(`/api/periods/${period}/status`).send({ status: 'closed' });
      const before = await snapshot();
      expect((await agent.post('/api/payments').send(base())).status).toBe(409);
      expect((await agent.put(`/api/payments/${payment}`).send(base())).status).toBe(409);
      expect((await agent.delete(`/api/payments/${payment}?period_id=${period}`)).status).toBe(409);
      expect((await commit([formRow()])).status).toBe(409);
      expect(await snapshot()).toEqual(before);
    });
  });
}
