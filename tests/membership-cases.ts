import { describe, it, expect, beforeAll, vi } from 'vitest';
import { query, execute, pool } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { personSave } from '../server/services.js';
import * as database from '../server/db.js';

export async function verifyMembershipMigration() {
  if (
    process.env.DB_NAME !== 'prisma_test' ||
    (await query('SELECT DATABASE() name'))[0].name !== 'prisma_test'
  )
    throw new Error('Only prisma_test');
  const global = await personSave({
    nombre: 'Global',
    apellido: 'Migración QA',
    telefono: '0000059001',
  });
  const accountOnly = await personSave({
    nombre: 'Cuenta',
    apellido: 'Migración QA',
    telefono: '0000059002',
  });
  const enrollmentOnly = await personSave({
    nombre: 'Actividad',
    apellido: 'Migración QA',
    telefono: '0000059003',
  });
  const [legacy] = await query('SELECT period_id,activity_id FROM enrollments LIMIT 1');
  for (const person of [accountOnly, enrollmentOnly])
    await execute('INSERT INTO period_memberships(person_id,period_id) VALUES (?,?)', [
      person.id,
      legacy.period_id,
    ]);
  await execute('INSERT INTO monthly_accounts(person_id,period_id) VALUES (?,?)', [
    accountOnly.id,
    legacy.period_id,
  ]);
  await execute('INSERT INTO enrollments(person_id,period_id,activity_id) VALUES (?,?,?)', [
    enrollmentOnly.id,
    legacy.period_id,
    legacy.activity_id,
  ]);
  await execute('UPDATE people SET activo=0 WHERE id=?', [enrollmentOnly.id]);
  const expected = await query(
    'SELECT person_id,period_id FROM enrollments UNION SELECT person_id,period_id FROM monthly_accounts ORDER BY person_id,period_id',
  );
  const preserved = await Promise.all(
    ['people', 'periods', 'enrollments', 'enrollment_slots', 'monthly_accounts', 'payments'].map(
      (t) => query(`SELECT * FROM ${t} ORDER BY id`),
    ),
  );
  await execute('ALTER TABLE enrollments DROP FOREIGN KEY fk_enrollment_membership');
  await execute('ALTER TABLE monthly_accounts DROP FOREIGN KEY fk_account_membership');
  await execute('DROP TABLE period_memberships');
  await execute("DELETE FROM schema_migrations WHERE name='008.sql'");
  const earlyConnection = await pool.getConnection();
  const earlyOriginal = earlyConnection.query.bind(earlyConnection);
  const earlySpy = vi.spyOn(earlyConnection, 'query').mockImplementation((async (
    ...args: any[]
  ) => {
    if (String(args[0]).trim().startsWith('INSERT INTO period_memberships'))
      throw new Error('Fallo backfill sintético 008');
    return (earlyOriginal as any)(...args);
  }) as any);
  const earlyAcquire = vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(earlyConnection);
  try {
    await expect(migrate('008.sql')).rejects.toThrow('Fallo backfill sintético 008');
  } finally {
    earlySpy.mockRestore();
    earlyAcquire.mockRestore();
  }
  expect(await query('SELECT * FROM period_memberships')).toEqual([]);
  expect(await query("SELECT name FROM schema_migrations WHERE name='008.sql'")).toEqual([]);
  const connection = await pool.getConnection();
  const original = connection.query.bind(connection);
  let executions = 0;
  const querySpy = vi.spyOn(connection, 'query').mockImplementation((async (...args: any[]) => {
    if (String(args[0]).trim() === 'EXECUTE membership_statement' && ++executions === 2)
      throw new Error('Fallo DDL sintético 008');
    return (original as any)(...args);
  }) as any);
  const acquire = vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
  try {
    await expect(migrate('008.sql')).rejects.toThrow('Fallo DDL sintético 008');
  } finally {
    querySpy.mockRestore();
    acquire.mockRestore();
  }
  // The migrator's rollback cannot undo the table, backfill or first ALTER.
  expect(
    await query('SELECT person_id,period_id FROM period_memberships ORDER BY person_id,period_id'),
  ).toEqual(expected);
  expect(await query("SELECT name FROM schema_migrations WHERE name='008.sql'")).toEqual([]);
  expect(
    await query(
      "SELECT CONSTRAINT_NAME name FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME IN ('fk_enrollment_membership','fk_account_membership')",
    ),
  ).toEqual([{ name: 'fk_enrollment_membership' }]);
  await migrate('008.sql');
  expect(
    await query('SELECT person_id,period_id FROM period_memberships ORDER BY person_id,period_id'),
  ).toEqual(expected);
  expect(await query('SELECT id FROM period_memberships WHERE person_id=?', [global.id])).toEqual(
    [],
  );
  expect(
    await query(
      'SELECT person_id FROM period_memberships WHERE person_id IN (?,?) ORDER BY person_id',
      [accountOnly.id, enrollmentOnly.id],
    ),
  ).toEqual([{ person_id: accountOnly.id }, { person_id: enrollmentOnly.id }]);
  const memberships = await query('SELECT * FROM period_memberships ORDER BY id');
  // Re-run all SQL even if both FKs already exist, then verify registered no-op.
  await execute("DELETE FROM schema_migrations WHERE name='008.sql'");
  await migrate('008.sql');
  await migrate('008.sql');
  expect(await query('SELECT * FROM period_memberships ORDER BY id')).toEqual(memberships);
  expect(
    await Promise.all(
      ['people', 'periods', 'enrollments', 'enrollment_slots', 'monthly_accounts', 'payments'].map(
        (t) => query(`SELECT * FROM ${t} ORDER BY id`),
      ),
    ),
  ).toEqual(preserved);
}

export function membershipTests(agent: any, password: string) {
  describe('Pertenencia explícita persona ↔ período', () => {
    let period: number,
      other: number,
      person: number,
      activity: number,
      schedule: number,
      member: number,
      enrollment: number;
    let serial = 0;
    const post = async (path: string, body: any) => {
      const r = await agent.post('/api' + path).send(body);
      expect(r.status, r.body.message).toBe(201);
      return r.body.id;
    };
    const makePerson = () =>
      post('/people', {
        nombre: 'Membresía',
        apellido: `Sintética ${++serial}`,
        telefono: `0000058${String(serial).padStart(4, '0')}`,
      });
    const list = (pr = period) => agent.get(`/api/periods/${pr}/memberships`);
    const add = (pid = person, pr = period) =>
      agent.post(`/api/periods/${pr}/memberships`).send({ person_id: pid });
    const remove = (mid = member, pr = period) =>
      agent.delete(`/api/periods/${pr}/memberships/${mid}`);
    const enrollmentBody = () => ({
      person_id: person,
      period_id: period,
      activity_id: activity,
      schedule_ids: [schedule],
    });
    beforeAll(async () => {
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
      period = await post('/periods', { year: 2058, month: 1 });
      other = await post('/periods', { year: 2058, month: 2 });
      person = await makePerson();
      activity = await post('/activities', { name: 'Membresías QA', mode: 'group', days: [1] });
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
    it('períodos nuevos vacíos, búsqueda global separada y operaciones sin membresía rechazadas', async () => {
      expect((await list()).body).toEqual([]);
      expect((await list(other)).body).toEqual([]);
      expect(
        (await agent.get('/api/people?q=00000580001')).body.rows.map((p: any) => p.id),
      ).toContain(person);
      expect((await agent.post('/api/enrollments').send(enrollmentBody())).status).toBe(409);
      expect(
        (
          await agent
            .put('/api/accounts')
            .send({ person_id: person, period_id: period, amount_due: '10' })
        ).status,
      ).toBe(409);
      expect(
        (
          await agent.post('/api/payments').send({
            person_id: person,
            period_id: period,
            date: '2058-01-02',
            amount: '10',
            method: 'cash',
            recipient: 'jesica',
          })
        ).status,
      ).toBe(409);
      await expect(
        execute('INSERT INTO monthly_accounts(person_id,period_id) VALUES (?,?)', [person, period]),
      ).rejects.toThrow();
      await expect(
        execute('INSERT INTO enrollments(person_id,period_id,activity_id) VALUES (?,?,?)', [
          person,
          period,
          activity,
        ]),
      ).rejects.toThrow();
    });
    it('alta concurrente única crea solamente membresía, con cero actividades', async () => {
      const responses = await Promise.all([add(), add()]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      member = responses.find((r) => r.status === 201).body.id;
      expect((await list()).body).toMatchObject([
        { id: person, membership_id: member, activities: null },
      ]);
      for (const table of ['enrollments', 'monthly_accounts'])
        expect(
          await query(`SELECT id FROM ${table} WHERE person_id=? AND period_id=?`, [
            person,
            period,
          ]),
        ).toEqual([]);
      expect((await list(other)).body).toEqual([]);
      expect((await add()).status).toBe(409);
      expect((await agent.get(`/api/dashboard?period_id=${period}`)).body).toMatchObject({
        people: 1,
        enrollments: 0,
      });
      expect((await agent.delete(`/api/periods/${period}`)).status).toBe(409);
    });
    it('rechaza ID de membresía cruzado y permite quitar sin borrar people', async () => {
      expect((await remove(member, other)).status).toBe(404);
      expect((await remove()).status).toBe(200);
      expect((await list()).body).toEqual([]);
      expect((await agent.get(`/api/people/${person}`)).status).toBe(200);
      member = (await add()).body.id;
    });
    it('asigna actividad después del alta, bloquea baja y conserva membresía al cancelar última actividad', async () => {
      enrollment = await post('/enrollments', enrollmentBody());
      expect((await remove()).status).toBe(409);
      expect(
        (
          await agent
            .put(`/api/enrollments/${enrollment}`)
            .send({ ...enrollmentBody(), period_id: other })
        ).status,
      ).toBe(409);
      expect((await agent.delete(`/api/enrollments/${enrollment}?period_id=${other}`)).status).toBe(
        409,
      );
      expect(
        (await agent.delete(`/api/enrollments/${enrollment}?period_id=${period}`)).status,
      ).toBe(200);
      expect((await list()).body[0]).toMatchObject({ membership_id: member, activities: null });
      const r = await remove();
      expect(r.status).toBe(409);
      expect(r.body.message).toContain('cuenta mensual');
    });
    it('cuenta incluso con cero definido y pagos bloquean baja sin perder datos, IDs financieros cruzados rechazados', async () => {
      expect(
        (
          await agent
            .put('/api/accounts')
            .send({ person_id: person, period_id: period, amount_due: '0' })
        ).status,
      ).toBe(200);
      expect((await remove()).status).toBe(409);
      expect(
        (
          await agent
            .put('/api/accounts')
            .send({ person_id: person, period_id: period, amount_due: '100' })
        ).status,
      ).toBe(200);
      const payment = await post('/payments', {
        person_id: person,
        period_id: period,
        date: '2058-01-02',
        amount: '10',
        method: 'cash',
        recipient: 'jesica',
      });
      await add(person, other);
      const before = await Promise.all(
        ['monthly_accounts', 'payments', 'period_memberships'].map((t) =>
          query(`SELECT * FROM ${t} ORDER BY id`),
        ),
      );
      expect((await remove()).status).toBe(409);
      expect(
        (
          await agent.put(`/api/payments/${payment}`).send({
            person_id: person,
            period_id: other,
            date: '2058-02-02',
            amount: '10',
            method: 'cash',
            recipient: 'jesica',
          })
        ).status,
      ).toBe(409);
      expect((await agent.delete(`/api/payments/${payment}?period_id=${other}`)).status).toBe(409);
      expect(
        await Promise.all(
          ['monthly_accounts', 'payments', 'period_memberships'].map((t) =>
            query(`SELECT * FROM ${t} ORDER BY id`),
          ),
        ),
      ).toEqual(before);
    });
    it('clona configuración con cero membresías desde fuente con personas y finanzas', async () => {
      const offering = await post('/offerings', {
        period_id: other,
        activity_id: activity,
        mode: 'group',
        days: [1],
      });
      const sourceSchedule = await post('/schedules', {
        offering_id: offering,
        day: 1,
        start: '09:00',
        end: '10:00',
        instructor_ids: [],
      });
      await post('/enrollments', {
        ...enrollmentBody(),
        period_id: other,
        schedule_ids: [sourceSchedule],
      });
      const destination = await post('/periods', { year: 2058, month: 3, mode: 'clone_previous' });
      expect((await list(destination)).body).toEqual([]);
      expect(
        (await agent.get(`/api/offerings?period_id=${destination}`)).body[0].schedules,
      ).toHaveLength(1);
      expect((await agent.get(`/api/accounts?period_id=${destination}`)).body).toEqual([]);
    });
    it('cierre bloquea altas/bajas, archivados históricos visibles y nuevas incorporaciones rechazadas', async () => {
      const fresh = await makePerson();
      await agent.patch(`/api/periods/${period}/status`).send({ status: 'closed' });
      expect((await add(fresh)).status).toBe(409);
      expect((await remove()).status).toBe(409);
      expect((await agent.delete(`/api/people/${person}`)).status).toBe(200);
      expect((await list()).body[0]).toMatchObject({ id: person, activo: 0 });
      const newPeriod = await post('/periods', { year: 2058, month: 4 });
      expect((await add(person, newPeriod)).status).toBe(409);
      expect((await agent.get(`/api/people/${person}`)).status).toBe(200);
    });
    it('fallo después de insertar revierte el alta de membresía', async () => {
      const fresh = await makePerson();
      const original = database.execute;
      const spy = vi.spyOn(database, 'execute').mockImplementation(async (sql, values, db) => {
        const result = await original(sql, values, db);
        if (sql.startsWith('INSERT INTO period_memberships')) throw new Error('Fallo membresía QA');
        return result;
      });
      try {
        expect((await add(fresh, other)).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await query('SELECT id FROM period_memberships WHERE person_id=?', [fresh])).toEqual(
        [],
      );
    });
    it('inscripción sin cuenta también bloquea la baja y las FK impiden borrar su membresía', async () => {
      const fresh = await makePerson();
      const m = (await add(fresh, other)).body.id;
      await execute('INSERT INTO enrollments(person_id,period_id,activity_id) VALUES (?,?,?)', [
        fresh,
        other,
        activity,
      ]);
      expect((await remove(m, other)).status).toBe(409);
      await expect(execute('DELETE FROM period_memberships WHERE id=?', [m])).rejects.toThrow();
      expect((await list(other)).body.some((p: any) => p.id === fresh)).toBe(true);
    });
    it('competencia entre baja y asignación nunca deja operaciones sin membresía', async () => {
      const fresh = await makePerson();
      const destination = await post('/periods', { year: 2058, month: 5 });
      const offering = await post('/offerings', {
        period_id: destination,
        activity_id: activity,
        mode: 'group',
        days: [1],
      });
      const s = await post('/schedules', {
        offering_id: offering,
        day: 1,
        start: '09:00',
        end: '10:00',
        instructor_ids: [],
      });
      const m = (await add(fresh, destination)).body.id;
      const [removed, assigned] = await Promise.all([
        remove(m, destination),
        agent.post('/api/enrollments').send({
          person_id: fresh,
          period_id: destination,
          activity_id: activity,
          schedule_ids: [s],
        }),
      ]);
      expect([
        [200, 409],
        [409, 201],
      ]).toContainEqual([removed.status, assigned.status]);
      const members = (await list(destination)).body;
      const enrollments = (await agent.get(`/api/enrollments?period_id=${destination}`)).body;
      expect(members.length).toBe(enrollments.length);
    });
  });
}
