import { beforeAll, describe, expect, it, vi } from 'vitest';
import { execute, query } from '../server/db.js';
import * as database from '../server/db.js';
import { incorporateTestPerson } from './model-fixtures.js';

// Registered in the existing integration suite: no concurrent schema reset.
export function clonePeriodTests(agent: any, password: string) {
  describe('Crear período vacío o clonar configuración', () => {
    let source: number, activity: number, teacher: number, offering: number, schedule: number;
    const post = async (path: string, body: unknown) => {
      if (path === '/enrollments') {
        const p = body as { person_id: number; period_id: number };
        await incorporateTestPerson(agent, p.person_id, p.period_id);
      }
      const response = await agent.post(`/api${path}`).send(body);
      expect(response.status, response.body.message).toBe(201);
      return response.body.id as number;
    };
    const config = async (period: number) =>
      (await agent.get(`/api/offerings?period_id=${period}`)).body;
    const snapshot = async () => {
      const tables = [
        'people',
        'activities',
        'instructors',
        'periods',
        'period_activities',
        'period_activity_days',
        'activity_schedules',
        'schedule_instructors',
        'enrollments',
        'period_memberships',
        'enrollment_slots',
        'monthly_accounts',
        'payments',
        'facilitator_accounts',
        'facilitator_payments',
        'period_expense_categories',
        'period_expenses',
        'advertising_investments',
        'import_receipts',
      ];
      return Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => [table, await query(`SELECT * FROM ${table}`)]),
        ),
      );
    };
    beforeAll(async () => {
      if (
        process.env.RUN_DB_TESTS !== 'true' ||
        process.env.DB_NAME !== 'prisma_test' ||
        (await query('SELECT DATABASE() name'))[0].name !== 'prisma_test'
      )
        throw new Error('Only prisma_test');
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
      // Insert a later date first so chronological order differs from ID order.
      source = await post('/periods', { year: 2045, month: 10 });
      await post('/periods', { year: 2045, month: 8 });
      await post('/periods', { year: 2046, month: 2 });
      activity = await post('/activities', {
        name: 'Catálogo clonación QA',
        mode: 'group',
        days: [1, 3],
      });
      teacher = await post('/instructors', { name: 'Facilitador clonación QA' });
      const secondTeacher = await post('/instructors', {
        name: 'Segundo facilitador clonación QA',
      });
      offering = await post('/offerings', {
        period_id: source,
        activity_id: activity,
        mode: 'individual',
        days: [1, 3],
      });
      schedule = await post('/schedules', {
        offering_id: offering,
        day: 1,
        start: '10:00',
        end: '11:00',
        instructor_ids: [teacher, secondTeacher],
      });
      await post('/schedules', {
        offering_id: offering,
        day: 3,
        start: '12:00',
        end: '13:00',
        instructor_ids: [],
        active: false,
      });
      const inactiveActivity = await post('/activities', {
        name: 'Oferta deshabilitada clonación QA',
        days: [5],
      });
      const inactiveOffering = await post('/offerings', {
        period_id: source,
        activity_id: inactiveActivity,
        mode: 'group',
        days: [5],
        active: false,
      });
      await post('/schedules', {
        offering_id: inactiveOffering,
        day: 5,
        start: '14:00',
        end: '15:00',
        instructor_ids: [teacher],
        active: false,
      });
      const person = await post('/people', {
        nombre: 'Clonación',
        apellido: 'Ficticia QA',
        telefono: '0000094567',
      });
      await post('/enrollments', {
        person_id: person,
        period_id: source,
        activity_id: activity,
        schedule_ids: [schedule],
      });
      const account = (
        await query('SELECT id FROM monthly_accounts WHERE person_id=? AND period_id=?', [
          person,
          source,
        ])
      )[0].id;
      await execute('UPDATE monthly_accounts SET amount_due=100 WHERE id=?', [account]);
      await execute(
        "INSERT INTO payments(account_id,date,amount,method,recipient,notes) VALUES (?,'2045-10-05',25,'cash','jesica','QA')",
        [account],
      );
      const facilitatorAccount = (
        await execute(
          "INSERT INTO facilitator_accounts(offering_id,instructor_id,amount_due,notes) VALUES (?,?,100,'QA')",
          [offering, teacher],
        )
      ).insertId;
      await execute(
        "INSERT INTO facilitator_payments(account_id,date,amount,notes) VALUES (?,'2045-10-05',25,'QA')",
        [facilitatorAccount],
      );
      const category = (
        await execute(
          "INSERT INTO period_expense_categories(period_id,name) VALUES (?,'Categoría clonación QA')",
          [source],
        )
      ).insertId;
      await execute(
        "INSERT INTO period_expenses(category_id,concept,date,amount,notes) VALUES (?,'Gasto QA','2045-10-05',10,'QA')",
        [category],
      );
      // Historical snapshots differ from current global names/defaults.
      await execute("UPDATE period_activities SET name='Nombre propio de oferta QA' WHERE id=?", [
        offering,
      ]);
      await execute(
        "UPDATE schedule_instructors SET display_name='Nombre asignado QA' WHERE schedule_id=? AND instructor_id=?",
        [schedule, teacher],
      );
      await execute('UPDATE instructors SET active=0 WHERE id=?', [secondTeacher]);
      await execute('UPDATE activities SET active=0 WHERE id=?', [inactiveActivity]);
      expect(
        (await agent.patch(`/api/periods/${source}/status`).send({ status: 'closed' })).status,
      ).toBe(200);
    });

    it('mantiene creación vacía con modo omitido o explícito', async () => {
      for (const body of [
        { year: 2047, month: 1 },
        { year: 2047, month: 2, mode: 'empty' },
      ]) {
        const id = await post('/periods', body);
        expect(await config(id)).toEqual([]);
        expect((await query('SELECT status FROM periods WHERE id=?', [id]))[0].status).toBe('open');
      }
    });

    it('copia el anterior por fecha, conserva estados y nombres, sin historia ni movimientos', async () => {
      const before = await snapshot();
      const original = await config(source);
      const destination = await post('/periods', { year: 2045, month: 11, mode: 'clone_previous' });
      const cloned = await config(destination);
      expect(cloned).toHaveLength(original.length);
      expect((await query('SELECT status FROM periods WHERE id=?', [destination]))[0].status).toBe(
        'open',
      );
      for (const old of original) {
        const copy = cloned.find((o: any) => o.activity_id === old.activity_id);
        expect(copy.id).not.toBe(old.id);
        expect(copy).toMatchObject({
          name: old.name,
          mode: old.mode,
          active: old.active,
          ever_used: 0,
          days: old.days,
        });
        expect(copy.schedules).toHaveLength(old.schedules.length);
        for (const previous of old.schedules) {
          const next = copy.schedules.find(
            (s: any) => s.day === previous.day && s.start === previous.start,
          );
          expect(next.id).not.toBe(previous.id);
          expect(next).toMatchObject({
            offering_id: copy.id,
            day: previous.day,
            start: previous.start,
            end: previous.end,
            active: previous.active,
            ever_used: 0,
          });
          expect(next.instructors).toEqual(
            previous.instructors.map((i: any) => ({ ...i, schedule_id: next.id })),
          );
          // Presentation uses the catalog; cloning must still preserve stored snapshots.
          expect(
            await query(
              'SELECT instructor_id,display_name FROM schedule_instructors WHERE schedule_id=? ORDER BY instructor_id',
              [next.id],
            ),
          ).toEqual(
            await query(
              'SELECT instructor_id,display_name FROM schedule_instructors WHERE schedule_id=? ORDER BY instructor_id',
              [previous.id],
            ),
          );
        }
      }
      const after = await snapshot();
      for (const table of [
        'people',
        'period_memberships',
        'activities',
        'instructors',
        'enrollments',
        'enrollment_slots',
        'monthly_accounts',
        'payments',
        'facilitator_accounts',
        'facilitator_payments',
        'period_expense_categories',
        'period_expenses',
        'advertising_investments',
        'import_receipts',
      ])
        expect(after[table]).toEqual(before[table]);
      for (const table of ['periods', 'period_activities', 'activity_schedules'])
        expect(
          after[table].filter((row: any) => before[table].some((old: any) => old.id === row.id)),
        ).toEqual(before[table]);
      for (const table of ['period_activity_days', 'schedule_instructors'])
        for (const row of before[table]) expect(after[table]).toContainEqual(row);
      expect(await config(source)).toEqual(original);
      expect((await agent.get(`/api/enrollments?period_id=${destination}`)).body).toEqual([]);
      expect((await agent.get(`/api/periods/${destination}/memberships`)).body).toEqual([]);
      expect((await agent.get(`/api/accounts?period_id=${destination}`)).body).toEqual([]);
      expect((await agent.get(`/api/periods/${destination}/expense-categories`)).body).toEqual([]);
      const facilitatorRows = (
        await agent.get(`/api/facilitator-accounts?period_id=${destination}`)
      ).body;
      expect(facilitatorRows.length).toBeGreaterThan(0);
      for (const row of facilitatorRows)
        expect(row).toMatchObject({ id: null, amount_due: null, paid: '0.00' });
      const o = cloned.find((o: any) => o.activity_id === activity);
      expect(
        (
          await agent
            .put(`/api/offerings/${o.id}`)
            .send({ period_id: destination, activity_id: activity, mode: 'group', days: o.days })
        ).status,
      ).toBe(200);
      const s = o.schedules.find((s: any) => s.day === 1);
      expect(
        (
          await agent.put(`/api/schedules/${s.id}`).send({
            offering_id: o.id,
            day: 1,
            start: '09:00',
            end: '10:00',
            instructor_ids: [teacher],
          })
        ).status,
      ).toBe(200);
      expect(await config(source)).toEqual(original);
    });

    it('usa el anterior al cambiar de año y al crear un período histórico', async () => {
      const historical = await post('/periods', { year: 2045, month: 9, mode: 'clone_previous' });
      expect(await config(historical)).toEqual([]); // August, not October or another older offer.
      const january = await post('/periods', { year: 2046, month: 1, mode: 'clone_previous' });
      const november = (await query('SELECT id FROM periods WHERE year=2045 AND month=11'))[0].id;
      expect((await config(january)).map((o: any) => o.activity_id)).toEqual(
        (await config(november)).map((o: any) => o.activity_id),
      );
      expect((await config(january)).find((o: any) => o.activity_id === activity).mode).toBe(
        'group',
      );
    });

    it('no salta un período anterior vacío ni permite elegir otra fuente', async () => {
      await post('/periods', { year: 2046, month: 3 });
      const destination = await post('/periods', { year: 2046, month: 4, mode: 'clone_previous' });
      expect(await config(destination)).toEqual([]);
      expect(
        (
          await agent
            .post('/api/periods')
            .send({ year: 2046, month: 5, mode: 'clone_previous', source_period_id: source })
        ).status,
      ).toBe(422);
      expect(await query('SELECT id FROM periods WHERE year=2046 AND month=5')).toEqual([]);
    });

    it('rechaza falta de fuente y duplicados sin dejar filas parciales', async () => {
      const before = await snapshot();
      expect(
        (await agent.post('/api/periods').send({ year: 2020, month: 1, mode: 'clone_previous' }))
          .status,
      ).toBe(409);
      expect(
        (await agent.post('/api/periods').send({ year: 2045, month: 11, mode: 'clone_previous' }))
          .status,
      ).toBe(409);
      expect(await snapshot()).toEqual(before);
    });

    it('revierte período, ofertas, días y horarios ante un fallo al copiar facilitadores', async () => {
      const before = await snapshot();
      // Fail only the final copy step; preceding inserts and rollback use real MySQL.
      const realExecute = database.execute;
      const failure = vi.spyOn(database, 'execute').mockImplementation((sql, values, db) => {
        if (sql.startsWith('INSERT INTO schedule_instructors') && sql.includes('SELECT'))
          throw new Error('Clone test failure');
        return realExecute(sql, values, db);
      });
      try {
        expect(
          (await agent.post('/api/periods').send({ year: 2045, month: 12, mode: 'clone_previous' }))
            .status,
        ).toBe(500);
        expect(await snapshot()).toEqual(before);
      } finally {
        failure.mockRestore();
      }
    });
  });
}
