import { beforeAll, describe, expect, it } from 'vitest';
import { execute, query } from '../server/db.js';
import { migrate } from '../server/migrate.js';

async function requireExpenseTestDatabase() {
  if (
    process.env.RUN_DB_TESTS !== 'true' ||
    process.env.DB_NAME !== 'prisma_test' ||
    (await query('SELECT DATABASE() name'))[0].name !== 'prisma_test'
  )
    throw new Error('Only prisma_test');
}
export async function expenseMigrationFixture() {
  await requireExpenseTestDatabase();
  await execute("INSERT INTO periods(year,month,status) VALUES (2033,1,'closed'),(2033,2,'open')");
  await execute(`INSERT INTO advertising_investments(date,concept,amount,notes,created_at,updated_at) VALUES
    ('2033-01-05','Histórico con notas',1250.50,'Conservar comentario','2033-01-05 10:11:12','2033-01-06 12:13:14'),
    ('2033-01-10','Histórico cero',0,'Cero permitido en legado','2033-01-10 10:11:12','2033-01-11 12:13:14'),
    ('2033-03-12','Mes faltante',10,'Conservar sin período','2033-03-12 10:11:12','2033-03-13 12:13:14')`);
}

export async function verifyExpenseMigrationPreflight() {
  await requireExpenseTestDatabase();
  const periods = await query('SELECT * FROM periods ORDER BY id');
  const history = await query('SELECT * FROM advertising_investments ORDER BY id');
  const orphan = history.find((row) => row.date === '2033-03-12')!;
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(migrate()).rejects.toThrow(
      `007.sql detenida: 1 registro(s) histórico(s) de publicidad sin período existente. IDs y fechas: ${orphan.id} (2033-03-12)`,
    );
    expect(await query('SELECT * FROM periods ORDER BY id')).toEqual(periods);
    expect(await query('SELECT * FROM advertising_investments ORDER BY id')).toEqual(history);
    expect(await query("SELECT name FROM schema_migrations WHERE name='007.sql'")).toEqual([]);
    expect(
      await query(
        "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('period_expenses','period_expense_categories')",
      ),
    ).toEqual([]);
  }
  // Explicit fixture setup, never a migration side effect: a reviewed existing period.
  await execute("INSERT INTO periods(year,month,status) VALUES (2033,3,'open')");
}

export async function verifyExpenseMigration() {
  await requireExpenseTestDatabase();
  const original = await query(
    'SELECT id,concept,date,amount,notes,created_at,updated_at FROM advertising_investments ORDER BY id',
  );
  const migrated = await query(
    'SELECT legacy_advertising_id AS id,concept,date,amount,notes,created_at,updated_at FROM period_expenses ORDER BY legacy_advertising_id',
  );
  expect(migrated).toEqual(original);
  expect(
    await query(
      `SELECT p.year,p.month,p.status,c.name FROM period_expense_categories c JOIN periods p ON p.id=c.period_id ORDER BY p.month`,
    ),
  ).toEqual([
    { year: 2033, month: 1, status: 'closed', name: 'Publicidad' },
    { year: 2033, month: 3, status: 'open', name: 'Publicidad' },
  ]);
  expect(
    await query(
      `SELECT c.id FROM period_expense_categories c JOIN periods p ON p.id=c.period_id WHERE p.year=2033 AND p.month=2`,
    ),
  ).toEqual([]);
  const [category] = await query('SELECT id FROM period_expense_categories ORDER BY id LIMIT 1');
  await expect(
    execute(
      "INSERT INTO period_expenses(category_id,concept,date,amount,notes) VALUES (?,'Cero nuevo','2033-01-01',0,'')",
      [category.id],
    ),
  ).rejects.toThrow();
  const categories = await query('SELECT * FROM period_expense_categories ORDER BY id');
  // Simulate a retry after SQL applied but migration registration did not finish.
  await execute("DELETE FROM schema_migrations WHERE name='007.sql'");
  await migrate();
  expect(await query('SELECT * FROM period_expense_categories ORDER BY id')).toEqual(categories);
  expect(
    await query(
      'SELECT legacy_advertising_id AS id,concept,date,amount,notes,created_at,updated_at FROM period_expenses ORDER BY legacy_advertising_id',
    ),
  ).toEqual(original);
}

export function expenseTests(agent: any, password: string) {
  describe('Gastos por período', () => {
    let period: number, other: number, category: number, second: number, expense: number;
    const base = (p = period) => `/api/periods/${p}/expense-categories`;
    const cat = (c = category, p = period) => `${base(p)}/${c}`;
    const body = {
      concept: '  Insumos  ',
      date: '2034-01-05',
      amount: '25.50',
      notes: 'Comentario',
    };
    beforeAll(async () => {
      await requireExpenseTestDatabase();
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
      period = (await agent.post('/api/periods').send({ year: 2034, month: 1 })).body.id;
      other = (await agent.post('/api/periods').send({ year: 2034, month: 2 })).body.id;
    });
    it('empieza sin categorías y crea una categoría vacía con nombre recortado', async () => {
      expect((await agent.get(base())).body).toEqual([]);
      const r = await agent.post(base()).send({ name: '  Café  ' });
      expect(r.status).toBe(201);
      category = r.body.id;
      expect((await agent.get(base())).body).toMatchObject([
        { id: category, name: 'Café', expenses: [] },
      ]);
      expect((await agent.get(base(other))).body).toEqual([]);
      expect(
        (await agent.put(`/api/periods/${period}`).send({ year: 2034, month: 4 })).status,
      ).toBe(409);
      expect((await agent.delete(`/api/periods/${period}`)).status).toBe(409);
    });
    it('valida vacío, duplicados por collation e inyección de claves', async () => {
      for (const name of ['', '   ', 'a'.repeat(201)])
        expect((await agent.post(base()).send({ name })).status).toBe(422);
      expect((await agent.post(base()).send({ name: ' cafe ' })).status).toBe(409);
      expect((await agent.post(base()).send({ name: 'Otra', period_id: other })).status).toBe(422);
      expect((await agent.post(base(other)).send({ name: 'Café' })).status).toBe(201);
      second = (await agent.post(base()).send({ name: 'Alquiler' })).body.id;
      expect((await agent.put(cat(second)).send({ name: 'CAFÉ' })).status).toBe(409);
    });
    it('crea y edita gastos y renombra categoría preservando movimientos', async () => {
      const r = await agent.post(`${cat()}/expenses`).send(body);
      expect(r.status).toBe(201);
      expense = r.body.id;
      expect((await agent.put(cat()).send({ name: 'Insumos' })).status).toBe(200);
      expect(
        (
          await agent
            .put(`${cat()}/expenses/${expense}`)
            .send({ ...body, concept: 'Actualizado', amount: '30', notes: '' })
        ).status,
      ).toBe(200);
      const list = (await agent.get(base())).body;
      expect(list.find((c: any) => c.id === category)).toMatchObject({
        name: 'Insumos',
        expenses: [
          { id: expense, concept: 'Actualizado', date: body.date, amount: '30.00', notes: '' },
        ],
      });
    });
    it('rechaza monto inválido, fechas inválidas o ajenas y campos manipulados', async () => {
      for (const amount of ['0', '-1', '1.001', '10000000000'])
        expect((await agent.post(`${cat()}/expenses`).send({ ...body, amount })).status).toBe(422);
      for (const date of ['2034-02-01', '2034-02-30', ''])
        expect((await agent.post(`${cat()}/expenses`).send({ ...body, date })).status).toBe(422);
      expect(
        (await agent.post(`${cat()}/expenses`).send({ ...body, category_id: second })).status,
      ).toBe(422);
      expect(
        (await agent.put(`${cat()}/expenses/${expense}`).send({ ...body, amount: '0' })).status,
      ).toBe(422);
    });
    it('API rechaza altas y ediciones fuera del período sin crear períodos ni alterar gastos', async () => {
      const periods = await query('SELECT * FROM periods ORDER BY id');
      const snapshot = (await agent.get(base())).body;
      for (const date of ['2034-02-07', '2020-05-07']) {
        for (const response of [
          await agent.post(`${cat()}/expenses`).send({ ...body, date }),
          await agent.put(`${cat()}/expenses/${expense}`).send({ ...body, date }),
        ]) {
          expect(response.status).toBe(422);
          expect(JSON.stringify(response.body)).toContain(
            'La fecha del gasto debe pertenecer al período seleccionado.',
          );
        }
      }
      expect(await query('SELECT * FROM periods ORDER BY id')).toEqual(periods);
      expect((await agent.get(base())).body).toEqual(snapshot);
    });
    it('rechaza IDs inexistentes y cruces de categoría o período', async () => {
      expect((await agent.get(base(999999))).status).toBe(404);
      expect((await agent.put(cat(999999)).send({ name: 'X' })).status).toBe(404);
      expect((await agent.post(`${cat(999999)}/expenses`).send(body)).status).toBe(404);
      expect((await agent.put(`${cat()}/expenses/999999`).send(body)).status).toBe(404);
      expect((await agent.delete(`${cat()}/expenses/999999`)).status).toBe(404);
      expect((await agent.delete(cat(999999))).status).toBe(404);
      expect((await agent.put(cat(category, other)).send({ name: 'Cruce' })).status).toBe(404);
      expect((await agent.delete(cat(category, other))).status).toBe(404);
      expect(
        (await agent.post(`${cat(category, other)}/expenses`).send({ ...body, date: '2034-02-01' }))
          .status,
      ).toBe(404);
      for (const path of [
        `${cat(second)}/expenses/${expense}`,
        `${cat(category, other)}/expenses/${expense}`,
      ]) {
        expect((await agent.put(path).send(body)).status).toBe(404);
        expect((await agent.delete(path)).status).toBe(404);
      }
      expect((await agent.get(base(other))).body[0].expenses).toEqual([]);
    });
    it('nuevo período no copia categorías, aunque otro período tenga gastos', async () => {
      const created = await agent.post('/api/periods').send({ year: 2034, month: 3 });
      expect(created.status).toBe(201);
      expect((await agent.get(base(created.body.id))).body).toEqual([]);
    });
    it('admite un gasto en un período histórico creado explícitamente y respeta su cierre', async () => {
      const created = await agent.post('/api/periods').send({ year: 2020, month: 5 });
      expect(created.status).toBe(201);
      const historicalBase = base(created.body.id);
      const category = await agent.post(historicalBase).send({ name: 'Histórico explícito' });
      expect(category.status).toBe(201);
      const path = `${historicalBase}/${category.body.id}/expenses`;
      const periods = await query('SELECT * FROM periods ORDER BY id');
      const data = { ...body, date: '2020-05-07' };
      expect((await agent.post(path).send(data)).status).toBe(201);
      expect(await query('SELECT * FROM periods ORDER BY id')).toEqual(periods);
      expect(
        (await agent.patch(`/api/periods/${created.body.id}/status`).send({ status: 'closed' }))
          .status,
      ).toBe(200);
      expect((await agent.post(path).send(data)).status).toBe(409);
      expect((await agent.get(historicalBase)).body[0].expenses).toHaveLength(1);
      expect(
        (await agent.patch(`/api/periods/${created.body.id}/status`).send({ status: 'open' }))
          .status,
      ).toBe(200);
      expect((await agent.post(path).send(data)).status).toBe(201);
    });
    it('elimina movimiento conservando categoría vacía y elimina categorías con cascada', async () => {
      expect((await agent.delete(`${cat()}/expenses/${expense}`)).status).toBe(200);
      expect((await agent.get(base())).body.find((c: any) => c.id === category).expenses).toEqual(
        [],
      );
      expect((await agent.delete(cat(second))).status).toBe(200);
      const created = await agent.post(`${cat()}/expenses`).send(body);
      expect(created.status).toBe(201);
      const another = await agent.post(`${cat()}/expenses`).send({ ...body, concept: 'Segundo' });
      expect(another.status).toBe(201);
      expect((await agent.delete(cat())).status).toBe(200);
      expect(await query('SELECT id FROM period_expenses WHERE id=?', [another.body.id])).toEqual(
        [],
      );
      expect(await query('SELECT id FROM period_expenses WHERE id=?', [created.body.id])).toEqual(
        [],
      );
      expect((await agent.get(base())).body).toEqual([]);
    });
    it('período cerrado bloquea las seis escrituras y mantiene lectura', async () => {
      category = (await agent.post(base()).send({ name: 'Cierre' })).body.id;
      expense = (await agent.post(`${cat()}/expenses`).send(body)).body.id;
      expect(
        (await agent.patch(`/api/periods/${period}/status`).send({ status: 'closed' })).status,
      ).toBe(200);
      const snapshot = (await agent.get(base())).body;
      expect((await agent.post(base()).send({ name: 'Bloqueada' })).status).toBe(409);
      expect((await agent.put(cat()).send({ name: 'Bloqueada' })).status).toBe(409);
      expect((await agent.delete(cat())).status).toBe(409);
      expect((await agent.post(`${cat()}/expenses`).send(body)).status).toBe(409);
      expect((await agent.put(`${cat()}/expenses/${expense}`).send(body)).status).toBe(409);
      expect((await agent.delete(`${cat()}/expenses/${expense}`)).status).toBe(409);
      expect((await agent.get(base())).body).toEqual(snapshot);
    });
  });
}
