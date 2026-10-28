import { describe, it, expect, beforeAll } from 'vitest';
import { execute, query } from '../server/db.js';

export function facilitatorTests(agent: any, password: string) {
  describe('Pago a facilitadores por período y actividad', () => {
    let period: number, offering: number, second: number, teacher: number, replacement: number;
    let account: number, payment: number;
    const list = () => agent.get(`/api/facilitator-accounts?period_id=${period}`);
    const accountBody = (amount_due: string | null) => ({
      offering_id: offering,
      instructor_id: teacher,
      amount_due,
      notes: 'Honorarios',
    });
    const save = (amount: string | null) =>
      agent.put('/api/facilitator-accounts').send(accountBody(amount));
    const path = () => `/api/facilitator-accounts/${account}/payments`;
    const pay = (amount: string) =>
      agent.post(path()).send({ date: '2027-02-03', amount, notes: 'Adelanto' });
    beforeAll(async () => {
      if (process.env.DB_NAME !== 'prisma_test') throw new Error('Only prisma_test');
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
      period = (await execute('INSERT INTO periods(year,month) VALUES (2025,1)')).insertId;
      const created = await agent.post('/api/instructors').send({ name: 'Lucía', surname: 'QA' });
      expect(created.status).toBe(201);
      teacher = created.body.id;
      replacement = (await execute("INSERT INTO instructors(name) VALUES ('Reemplazo QA')"))
        .insertId;
      for (const name of ['Movimiento QA', 'Yoga QA']) {
        const a = (await execute("INSERT INTO activities(name,mode) VALUES (?,'group')", [name]))
          .insertId;
        const o = (
          await execute(
            "INSERT INTO period_activities(period_id,activity_id,name,mode) VALUES (?,?,?,'group')",
            [period, a, name],
          )
        ).insertId;
        if (!offering) offering = o;
        else second = o;
        for (const day of [1, 3]) {
          const s = (
            await execute(
              "INSERT INTO activity_schedules(offering_id,day,start,end) VALUES (?,?,'10:00','11:00')",
              [o, day],
            )
          ).insertId;
          await execute(
            'INSERT INTO schedule_instructors(schedule_id,instructor_id,display_name) VALUES (?,?,?)',
            [s, teacher, 'Lucía histórica'],
          );
          if (o === offering)
            await execute(
              'INSERT INTO schedule_instructors(schedule_id,instructor_id,display_name) VALUES (?,?,?)',
              [s, replacement, 'Reemplazo histórico'],
            );
        }
      }
    });
    it('deduplica horarios, admite dos actividades y dos facilitadores, sin persistir cuentas', async () => {
      const r = await list();
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(3);
      expect(r.body.filter((a: any) => a.instructor_id === teacher)).toHaveLength(2);
      expect(r.body.filter((a: any) => a.instructor_id === replacement)).toHaveLength(1);
      expect(r.body[0]).toMatchObject({ id: null, amount_due: null, paid: '0.00', pending: null });
      expect((await query('SELECT * FROM facilitator_accounts')).length).toBe(0);
    });
    it('distingue NULL de cero y rechaza pagos sin importe o por encima de cero', async () => {
      let r = await save(null);
      expect(r.status).toBe(200);
      account = r.body.id;
      expect((await pay('1')).status).toBe(409);
      expect((await save('0')).status).toBe(200);
      expect((await list()).body.find((a: any) => a.id === account)).toMatchObject({
        amount_due: '0.00',
        pending: '0.00',
      });
      expect((await pay('1')).status).toBe(409);
      r = await save('110000');
      expect(r.body.id).toBe(account);
    });
    it('registra pagos parciales múltiples con fecha fuera del mes económico', async () => {
      const r = await pay('50000');
      expect(r.status).toBe(201);
      payment = r.body.id;
      expect((await pay('30000')).status).toBe(201);
      expect((await list()).body.find((a: any) => a.id === account)).toMatchObject({
        paid: '80000.00',
        pending: '30000.00',
      });
      expect((await agent.get(path())).body[0].date).toBe('2027-02-03');
    });
    it('refleja renombres por ID en configuración, agenda y cuentas abiertas/cerradas sin alterar historia', async () => {
      const tables = [
        'periods',
        'period_activities',
        'period_activity_days',
        'activity_schedules',
        'schedule_instructors',
        'facilitator_accounts',
        'facilitator_payments',
        'monthly_accounts',
        'payments',
        'enrollments',
        'enrollment_slots',
      ];
      const snapshot = () => Promise.all(tables.map((table) => query(`SELECT * FROM ${table}`)));
      for (const status of ['open', 'closed']) {
        expect((await agent.patch(`/api/periods/${period}/status`).send({ status })).status).toBe(
          200,
        );
        const before = await snapshot();
        const accountsBefore = (await list()).body;
        const names = new Map([
          [teacher, { name: 'Lucila', surname: status === 'open' ? 'QA Actual' : 'QA Cerrada' }],
          [replacement, { name: 'Reemplazo QA', surname: '' }],
        ]);
        for (const [id, name] of names) {
          const updated = await agent.put(`/api/instructors/${id}`).send(name);
          expect(updated.status).toBe(200);
          expect(updated.body.id).toBe(id);
        }
        const catalog = await agent.get('/api/instructors');
        expect(catalog.status).toBe(200);
        for (const [id, name] of names)
          expect(catalog.body.find((i: any) => i.id === id)).toMatchObject(name);
        const offers = await agent.get(`/api/offerings?period_id=${period}`);
        const agenda = await agent.get(`/api/agenda?period_id=${period}`);
        expect(offers.status).toBe(200);
        expect(agenda.status).toBe(200);
        for (const schedules of [offers.body.flatMap((o: any) => o.schedules), agenda.body]) {
          expect(schedules).toHaveLength(4);
          for (const s of schedules) {
            expect(s.instructors).toHaveLength(s.offering_id === offering ? 2 : 1);
            for (const i of s.instructors) {
              const current = names.get(i.id)!;
              expect(i.name).toBe([current.name, current.surname].filter(Boolean).join(' '));
            }
          }
        }
        const accounts = await list();
        expect(accounts.status).toBe(200);
        expect(accounts.body).toHaveLength(accountsBefore.length);
        for (const row of accounts.body) {
          const current = names.get(row.instructor_id)!;
          expect(row.instructor).toBe([current.name, current.surname].filter(Boolean).join(' '));
          const old = accountsBefore.find(
            (a: any) => a.offering_id === row.offering_id && a.instructor_id === row.instructor_id,
          );
          expect({ ...row, instructor: old.instructor }).toEqual(old);
        }
        expect(await snapshot()).toEqual(before);
        expect((await agent.delete(`/api/instructors/${teacher}`)).status).toBe(409);
        expect(await snapshot()).toEqual(before);
      }
      expect(
        (await agent.patch(`/api/periods/${period}/status`).send({ status: 'open' })).status,
      ).toBe(200);
    });
    it('edita excluyendo el propio pago y rechaza sobrepago', async () => {
      expect(
        (
          await agent
            .put(`${path()}/${payment}`)
            .send({ date: '2026-12-31', amount: '60000', notes: 'Corrección' })
        ).status,
      ).toBe(200);
      expect(
        (await agent.put(`${path()}/${payment}`).send({ date: '2027-02-03', amount: '90000' }))
          .status,
      ).toBe(409);
      expect((await pay('30000')).status).toBe(409);
      expect((await list()).body.find((a: any) => a.id === account).paid).toBe('90000.00');
    });
    it('elimina un movimiento y recalcula', async () => {
      expect((await agent.delete(`${path()}/${payment}`)).status).toBe(200);
      expect((await list()).body.find((a: any) => a.id === account)).toMatchObject({
        paid: '30000.00',
        pending: '80000.00',
      });
    });
    it('completa el importe y permite corregirlo por debajo de lo pagado', async () => {
      expect((await pay('80000')).status).toBe(201);
      expect((await list()).body.find((a: any) => a.id === account).pending).toBe('0.00');
      expect((await save('1')).status).toBe(200);
      expect((await list()).body.find((a: any) => a.id === account)).toMatchObject({
        paid: '110000.00',
        pending: '0.00',
      });
      expect((await pay('1')).status).toBe(409);
      const movements = (await agent.get(path())).body;
      expect(
        (await agent.put(`${path()}/${movements[0].id}`).send({ date: '2027-02-03', amount: '1' }))
          .status,
      ).toBe(409);
    });
    it('bloquea todas las escrituras al cerrar y permite corregir al reabrir', async () => {
      const p = (await agent.get(path())).body[0];
      expect(
        (await agent.patch(`/api/periods/${period}/status`).send({ status: 'closed' })).status,
      ).toBe(200);
      expect((await save('120000')).status).toBe(409);
      expect((await pay('1')).status).toBe(409);
      expect(
        (await agent.put(`${path()}/${p.id}`).send({ date: p.date, amount: p.amount })).status,
      ).toBe(409);
      expect((await agent.delete(`${path()}/${p.id}`)).status).toBe(409);
      expect((await agent.get(path())).status).toBe(200);
      expect(
        (await agent.patch(`/api/periods/${period}/status`).send({ status: 'open' })).status,
      ).toBe(200);
      expect((await save('120000')).status).toBe(200);
      expect(
        (
          await agent
            .put(`${path()}/${p.id}`)
            .send({ date: p.date, amount: p.amount, notes: 'Reabierto' })
        ).status,
      ).toBe(200);
    });
    it('conserva cuentas históricas tras quitar asignaciones y permite corregirlas', async () => {
      await execute(
        'DELETE si FROM schedule_instructors si JOIN activity_schedules s ON s.id=si.schedule_id WHERE s.offering_id=? AND si.instructor_id=?',
        [offering, teacher],
      );
      const row = (await list()).body.find((a: any) => a.id === account);
      expect(row).toMatchObject({ assigned: 0, paid: '110000.00', notes: 'Honorarios' });
      expect((await save('120001')).status).toBe(200);
      expect((await agent.delete(`/api/instructors/${teacher}`)).status).toBe(409);
      expect(
        (
          await agent
            .put('/api/facilitator-accounts')
            .send({ offering_id: second, instructor_id: replacement, amount_due: '5' })
        ).status,
      ).toBe(409);
    });
    it('serializa pagos concurrentes sin exceder el importe', async () => {
      await save('120000');
      const responses = await Promise.all([pay('10000'), pay('10000')]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect((await list()).body.find((a: any) => a.id === account)).toMatchObject({
        paid: '120000.00',
        pending: '0.00',
      });
    });
    it('valida importes, fechas e IDs y no permite editar pagos de otra cuenta', async () => {
      expect((await pay('0')).status).toBe(422);
      expect((await pay('1.001')).status).toBe(422);
      expect((await agent.post(path()).send({ date: '2027-02-30', amount: '1' })).status).toBe(422);
      const other = await agent
        .put('/api/facilitator-accounts')
        .send({ offering_id: second, instructor_id: teacher, amount_due: '10' });
      const p = (await agent.get(path())).body[0];
      expect(
        (
          await agent
            .put(`/api/facilitator-accounts/${other.body.id}/payments/${p.id}`)
            .send({ date: p.date, amount: '1' })
        ).status,
      ).toBe(404);
      expect(
        (await agent.delete(`/api/facilitator-accounts/${other.body.id}/payments/${p.id}`)).status,
      ).toBe(404);
    });
    it('registra un pago completo sin afectar otra actividad del mismo facilitador', async () => {
      const row = (await list()).body.find(
        (a: any) => a.offering_id === second && a.instructor_id === teacher,
      );
      const endpoint = `/api/facilitator-accounts/${row.id}/payments`;
      expect(
        (await agent.post(endpoint).send({ date: '2027-03-10', amount: '10', notes: 'Completo' }))
          .status,
      ).toBe(201);
      const rows = (await list()).body;
      expect(rows.find((a: any) => a.id === row.id)).toMatchObject({
        paid: '10.00',
        pending: '0.00',
      });
      expect(rows.find((a: any) => a.id === account).paid).toBe('120000.00');
    });
    it('incluye asignaciones deshabilitadas e inactivas, sin depender del catálogo legado', async () => {
      await execute('UPDATE instructors SET active=0 WHERE id=?', [replacement]);
      await execute('UPDATE activity_schedules SET active=0 WHERE offering_id=?', [offering]);
      const [o] = await query('SELECT activity_id FROM period_activities WHERE id=?', [offering]);
      await execute('UPDATE activities SET instructor_id=?,name=? WHERE id=?', [
        teacher,
        'Catálogo renombrado',
        o.activity_id,
      ]);
      const row = (await list()).body.find(
        (a: any) => a.offering_id === offering && a.instructor_id === replacement,
      );
      expect(row).toMatchObject({
        activity: 'Movimiento QA',
        instructor: 'Reemplazo QA',
        assigned: 1,
      });
      expect(
        (await list()).body.filter(
          (a: any) => a.offering_id === offering && a.instructor_id === teacher,
        ),
      ).toHaveLength(1);
      const anotherPeriod = (await execute('INSERT INTO periods(year,month) VALUES (2098,4)'))
        .insertId;
      expect(
        (await agent.get(`/api/facilitator-accounts?period_id=${anotherPeriod}`)).body,
      ).toEqual([]);
    });
    it('conserva pagos al volver a dejar el importe indefinido y permite eliminar después', async () => {
      expect((await save(null)).status).toBe(200);
      expect((await list()).body.find((a: any) => a.id === account)).toMatchObject({
        amount_due: null,
        paid: '120000.00',
        pending: null,
      });
      const p = (await agent.get(path())).body[0];
      expect(
        (await agent.put(`${path()}/${p.id}`).send({ date: p.date, amount: p.amount })).status,
      ).toBe(409);
      expect((await agent.delete(`${path()}/${p.id}`)).status).toBe(200);
    });
  });
}
