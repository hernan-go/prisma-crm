import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { execute, query } from '../server/db.js';
import * as database from '../server/db.js';
import { testCredentials, memorySessions } from './auth-helper.js';
import { cleanupPlan, applyCleanup } from '../server/qa-cleanup.js';

// Registered in integration.test.ts, after its guarded schema setup.
export function configurationDeletionTests() {
  describe('Configuración eliminable vs historial real', () => {
    let agent: any, credentials: Awaited<ReturnType<typeof testCredentials>>;
    let serial = 0;
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
      'enrollment_slots',
      'period_memberships',
      'monthly_accounts',
      'payments',
      'facilitator_accounts',
      'facilitator_payments',
      'period_expense_categories',
      'period_expenses',
      'advertising_investments',
      'import_receipts',
    ];
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => [table, await query(`SELECT * FROM ${table} ORDER BY 1,2`)]),
        ),
      );
    const post = async (path: string, body: unknown) => {
      const r = await agent.post(`/api${path}`).send(body);
      expect(r.status, r.body.message).toBe(201);
      return r.body.id as number;
    };
    const remove = (path: string) => agent.delete(`/api${path}`);
    const period = () => {
      const n = serial++;
      return post('/periods', { year: 2070 + Math.floor(n / 12), month: (n % 12) + 1 });
    };
    const person = () =>
      post('/people', {
        nombre: `Configuración ${serial++}`,
        apellido: 'Sintética',
        telefono: `000008${serial}`,
      });
    const config = async (pr?: number) => {
      pr ??= await period();
      const activity = await post('/activities', { name: `Config actividad ${serial++}` });
      const teacher = await post('/instructors', { name: `Config facilitador ${serial++}` });
      const offering = await post('/offerings', {
        period_id: pr,
        activity_id: activity,
        mode: 'group',
        days: [1],
      });
      const schedule = await post('/schedules', {
        offering_id: offering,
        day: 1,
        start: '09:00',
        end: '10:00',
        instructor_ids: [teacher],
      });
      return { pr, activity, teacher, offering, schedule };
    };
    type Config = Awaited<ReturnType<typeof config>>;
    const enrollmentBody = (c: Config, p: number) => ({
      person_id: p,
      period_id: c.pr,
      activity_id: c.activity,
      schedule_ids: [c.schedule],
    });
    const enroll = async (c: Config) => {
      const p = await person();
      const membership = await post(`/periods/${c.pr}/memberships`, { person_id: p });
      const enrollment = await post('/enrollments', enrollmentBody(c, p));
      return { p, membership, enrollment };
    };
    const account = async (c: Config) => {
      const r = await agent
        .put('/api/facilitator-accounts')
        .send({
          offering_id: c.offering,
          instructor_id: c.teacher,
          amount_due: null,
          notes: 'Conservar snapshot',
        });
      expect(r.status).toBe(200);
      return r.body.id as number;
    };
    const payFacilitator = async (c: Config) => {
      const id = await account(c);
      expect(
        (
          await agent
            .put('/api/facilitator-accounts')
            .send({ offering_id: c.offering, instructor_id: c.teacher, amount_due: '10' })
        ).status,
      ).toBe(200);
      await post(`/facilitator-accounts/${id}/payments`, { date: '2070-01-01', amount: '5' });
      return id;
    };
    const expectBlocked = async (path: string, message?: RegExp) => {
      const before = await snapshot();
      const r = await remove(path);
      expect(r.status, r.body.message).toBe(409);
      if (message) expect(r.body.message).toMatch(message);
      expect(await snapshot()).toEqual(before);
    };
    beforeAll(async () => {
      if (
        process.env.RUN_DB_TESTS !== 'true' ||
        process.env.DB_NAME !== 'prisma_test' ||
        (await query('SELECT DATABASE() name'))[0].name !== 'prisma_test'
      )
        throw new Error('Only prisma_test');
      credentials = await testCredentials();
    });
    beforeEach(async () => {
      agent = request.agent(createApp({ ...credentials, store: memorySessions() }));
      expect(
        (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
      ).toBe(200);
    });
    it('elimina un período vacío y responde 404 al repetir', async () => {
      const pr = await period();
      expect((await remove(`/periods/${pr}`)).status).toBe(200);
      expect((await remove(`/periods/${pr}`)).status).toBe(404);
    });
    it('elimina configuración clonada conservando fuente, catálogos e historia ajena', async () => {
      const source = await config(await post('/periods', { year: 2068, month: 10 }));
      await enroll(source);
      await payFacilitator(source);
      const before = await snapshot();
      const pr = await post('/periods', { year: 2068, month: 11, mode: 'clone_previous' });
      const offers = (await agent.get(`/api/offerings?period_id=${pr}`)).body;
      expect(offers).toHaveLength(1);
      expect(offers[0].ever_used).toBe(0);
      expect(offers[0].schedules[0].ever_used).toBe(0);
      expect((await remove(`/periods/${pr}`)).status).toBe(200);
      expect(await snapshot()).toEqual(before);
    });
    it('caso Noviembre: borra período con flags 1 tras cancelar inscripción y quitar cuenta vacía/membresía', async () => {
      const c = await config();
      const e = await enroll(c);
      expect((await remove(`/enrollments/${e.enrollment}?period_id=${c.pr}`)).status).toBe(200);
      expect((await remove(`/periods/${c.pr}/memberships/${e.membership}`)).status).toBe(200);
      expect(
        (await query('SELECT ever_used FROM period_activities WHERE id=?', [c.offering]))[0]
          .ever_used,
      ).toBe(1);
      expect(
        (await query('SELECT ever_used FROM activity_schedules WHERE id=?', [c.schedule]))[0]
          .ever_used,
      ).toBe(1);
      for (const table of ['period_memberships', 'enrollments', 'monthly_accounts'])
        expect(await query(`SELECT id FROM ${table} WHERE period_id=?`, [c.pr])).toEqual([]);
      await expectBlocked(`/offerings/${c.offering}`, /histórico/);
      await expectBlocked(`/schedules/${c.schedule}`, /histórico/);
      await expectBlocked(`/instructors/${c.teacher}`, /utilizados/);
      const catalogs = await Promise.all(
        ['activities', 'instructors', 'people'].map((t) => query(`SELECT * FROM ${t} ORDER BY id`)),
      );
      expect((await remove(`/periods/${c.pr}`)).status).toBe(200);
      expect(await query('SELECT id FROM period_activities WHERE id=?', [c.offering])).toEqual([]);
      expect(await query('SELECT id FROM activity_schedules WHERE id=?', [c.schedule])).toEqual([]);
      expect(
        await Promise.all(
          ['activities', 'instructors', 'people'].map((t) =>
            query(`SELECT * FROM ${t} ORDER BY id`),
          ),
        ),
      ).toEqual(catalogs);
    });
    it.each([
      'membership',
      'enrollment',
      'monthly_account',
      'payment',
      'facilitator_account',
      'facilitator_payment',
      'expense',
    ])('bloquea período con %s sin modificar ningún dato', async (kind) => {
      const c = await config();
      if (['membership', 'enrollment', 'monthly_account', 'payment'].includes(kind)) {
        const p = await person();
        await post(`/periods/${c.pr}/memberships`, { person_id: p });
        if (kind === 'enrollment') await post('/enrollments', enrollmentBody(c, p));
        if (kind === 'monthly_account')
          expect(
            (
              await agent
                .put('/api/accounts')
                .send({ person_id: p, period_id: c.pr, amount_due: null })
            ).status,
          ).toBe(200);
        if (kind === 'payment')
          await post('/payments', {
            person_id: p,
            period_id: c.pr,
            date: '2070-01-01',
            amount: '5',
            method: 'cash',
            recipient: 'jesica',
          });
      }
      if (kind === 'facilitator_account') await account(c);
      if (kind === 'facilitator_payment') await payFacilitator(c);
      if (kind === 'expense') {
        const category = await post(`/periods/${c.pr}/expense-categories`, { name: 'Conservar' });
        const [p] = await query('SELECT year,month FROM periods WHERE id=?', [c.pr]);
        await post(`/periods/${c.pr}/expense-categories/${category}/expenses`, {
          concept: 'Conservar gasto',
          date: `${p.year}-${String(p.month).padStart(2, '0')}-01`,
          amount: '5',
        });
      }
      await expectBlocked(`/periods/${c.pr}`);
    });
    it('elimina categoría vacía con período; editar fecha sigue bloqueado', async () => {
      const pr = await period(),
        category = await post(`/periods/${pr}/expense-categories`, { name: 'Vacía' });
      expect((await agent.put(`/api/periods/${pr}`).send({ year: 2099, month: 1 })).status).toBe(
        409,
      );
      expect((await remove(`/periods/${pr}`)).status).toBe(200);
      expect(
        await query('SELECT id FROM period_expense_categories WHERE id=?', [category]),
      ).toEqual([]);
    });
    it('closed bloquea eliminar/editar hasta reapertura, incluso sin datos', async () => {
      const pr = await period();
      await agent.patch(`/api/periods/${pr}/status`).send({ status: 'closed' });
      await expectBlocked(`/periods/${pr}`, /cerrado/);
      expect((await agent.put(`/api/periods/${pr}`).send({ year: 2099, month: 1 })).status).toBe(
        409,
      );
      await agent.patch(`/api/periods/${pr}/status`).send({ status: 'open' });
      expect((await agent.put(`/api/periods/${pr}`).send({ year: 2099, month: 1 })).status).toBe(
        200,
      );
      expect((await remove(`/periods/${pr}`)).status).toBe(200);
    });
    it('elimina horario nunca usado y sus asignaciones conservando oferta', async () => {
      const c = await config();
      expect((await remove(`/schedules/${c.schedule}`)).status).toBe(200);
      expect(
        await query('SELECT * FROM schedule_instructors WHERE schedule_id=?', [c.schedule]),
      ).toEqual([]);
      expect(await query('SELECT id FROM period_activities WHERE id=?', [c.offering])).toHaveLength(
        1,
      );
      expect((await remove(`/schedules/${c.schedule}`)).status).toBe(404);
    });
    it('actividad con oferta preparatoria exige retirarla primero, luego ignora flag legacy', async () => {
      const c = await config();
      await expectBlocked(`/activities/${c.activity}`, /Quitá primero/);
      expect((await remove(`/offerings/${c.offering}`)).status).toBe(200);
      expect(await query('SELECT id FROM activity_schedules WHERE id=?', [c.schedule])).toEqual([]);
      expect(
        await query('SELECT * FROM period_activity_days WHERE offering_id=?', [c.offering]),
      ).toEqual([]);
      expect(
        (await query('SELECT ever_used FROM activities WHERE id=?', [c.activity]))[0].ever_used,
      ).toBe(1);
      expect((await remove(`/activities/${c.activity}`)).status).toBe(200);
      expect((await remove(`/offerings/${c.offering}`)).status).toBe(404);
    });
    it('elimina catálogos nunca configurados', async () => {
      const a = await post('/activities', { name: `Nunca ofrecida ${serial++}` });
      const i = await post('/instructors', { name: 'Nunca asignado' });
      expect((await remove(`/activities/${a}`)).status).toBe(200);
      expect((await remove(`/instructors/${i}`)).status).toBe(200);
    });
    it('retira solo al facilitador preparatorio, conserva horarios y demás facilitadores', async () => {
      const c = await config(),
        other = await post('/instructors', { name: 'Otro preparatorio' });
      const pr = await period(),
        offering = await post('/offerings', {
          period_id: pr,
          activity_id: c.activity,
          mode: 'group',
          days: [1],
        });
      await post('/schedules', {
        offering_id: offering,
        day: 1,
        start: '10:00',
        end: '11:00',
        instructor_ids: [c.teacher, other],
      });
      const before = await query('SELECT * FROM activity_schedules ORDER BY id');
      expect((await remove(`/instructors/${c.teacher}`)).status).toBe(200);
      expect(await query('SELECT * FROM activity_schedules ORDER BY id')).toEqual(before);
      expect(
        await query('SELECT * FROM schedule_instructors WHERE instructor_id=?', [c.teacher]),
      ).toEqual([]);
      expect(
        await query('SELECT * FROM schedule_instructors WHERE instructor_id=?', [other]),
      ).toHaveLength(1);
    });
    it.each(['account', 'payment'])(
      'cuenta/pago de facilitador protege período, oferta, horario y catálogo (%s)',
      async (kind) => {
        const c = await config();
        if (kind === 'account') await account(c);
        else await payFacilitator(c);
        for (const path of [
          `/periods/${c.pr}`,
          `/offerings/${c.offering}`,
          `/schedules/${c.schedule}`,
          `/instructors/${c.teacher}`,
          `/activities/${c.activity}`,
        ])
          await expectBlocked(path);
      },
    );
    it('historia persistente protege actividad, facilitador, oferta y horario', async () => {
      const c = await config();
      await enroll(c);
      for (const path of [
        `/activities/${c.activity}`,
        `/instructors/${c.teacher}`,
        `/offerings/${c.offering}`,
        `/schedules/${c.schedule}`,
      ])
        await expectBlocked(path);
    });
    it('closed impide borrar configuración y desasignar desde catálogo', async () => {
      const c = await config();
      await agent.patch(`/api/periods/${c.pr}/status`).send({ status: 'closed' });
      for (const path of [
        `/offerings/${c.offering}`,
        `/schedules/${c.schedule}`,
        `/instructors/${c.teacher}`,
      ])
        await expectBlocked(path, /cerrado/);
    });
    it('referencia legacy impide borrar facilitador aunque no tenga asignaciones', async () => {
      const c = await config();
      await execute('UPDATE activities SET instructor_id=? WHERE id=?', [c.teacher, c.activity]);
      await expectBlocked(`/instructors/${c.teacher}`, /modelo anterior/);
    });
    it('slots externos/incoherentes bloquean período, oferta y horario sin depender de flags', async () => {
      const a = await config(),
        b = await config(),
        e = await enroll(b);
      await execute('UPDATE enrollment_slots SET schedule_id=? WHERE enrollment_id=?', [
        a.schedule,
        e.enrollment,
      ]);
      for (const path of [
        `/periods/${a.pr}`,
        `/offerings/${a.offering}`,
        `/schedules/${a.schedule}`,
        `/instructors/${a.teacher}`,
      ])
        await expectBlocked(path, /referenc/);
    });
    it('publicidad legacy del mes bloquea eliminación sin modificar respaldo', async () => {
      const pr = await period(),
        [p] = await query('SELECT year,month FROM periods WHERE id=?', [pr]);
      await execute(
        'INSERT INTO advertising_investments(date,concept,amount,notes) VALUES (?,?,5,?)',
        [`${p.year}-${String(p.month).padStart(2, '0')}-01`, 'Respaldo sintético', 'Conservar'],
      );
      await expectBlocked(`/periods/${pr}`, /publicidad histórica/);
    });
    it.each(['period', 'offering', 'schedule', 'instructor'] as const)(
      'rollback completo después de borrado intermedio: %s',
      async (kind) => {
        const c = await config();
        await post(`/periods/${c.pr}/expense-categories`, { name: 'Vacía rollback' });
        const path = {
          period: `/periods/${c.pr}`,
          offering: `/offerings/${c.offering}`,
          schedule: `/schedules/${c.schedule}`,
          instructor: `/instructors/${c.teacher}`,
        }[kind];
        const before = await snapshot(),
          original = database.execute;
        let injected = false;
        const spy = vi.spyOn(database, 'execute').mockImplementation(async (sql, values, db) => {
          const r = await original(sql, values, db);
          if (
            !injected &&
            (kind === 'period'
              ? sql.startsWith('DELETE s FROM activity_schedules')
              : kind === 'offering'
                ? sql.startsWith('DELETE FROM activity_schedules WHERE offering_id')
                : sql.startsWith('DELETE FROM schedule_instructors'))
          ) {
            injected = true;
            expect(r.affectedRows).toBeGreaterThan(0);
            throw new Error('Fallo sintético después de borrado');
          }
          return r;
        });
        try {
          expect((await remove(path)).status).toBe(500);
        } finally {
          spy.mockRestore();
        }
        expect(injected).toBe(true);
        expect(await snapshot()).toEqual(before);
        expect((await remove(path)).status).toBe(200);
      },
    );
    it('QA comparte reglas con API: retira asignaciones preparatorias e ignora flag legacy', async () => {
      const c = await config();
      await agent.put(`/api/instructors/${c.teacher}`).send({ name: 'Docente ficticio QA' });
      const plan = await cleanupPlan();
      plan.candidates.find(
        (cand) => cand.table === 'instructors' && cand.id === c.teacher,
      )!.reviewed = true;
      expect((await applyCleanup(plan, 'prisma_test')).deleted).toBe(1);
      expect(
        await query('SELECT id FROM activity_schedules WHERE id=?', [c.schedule]),
      ).toHaveLength(1);
    });
    it('QA conserva historia y revierte el lote completo', async () => {
      const c = await config();
      await enroll(c);
      await agent.put(`/api/instructors/${c.teacher}`).send({ name: 'Docente ficticio QA' });
      const plan = await cleanupPlan();
      plan.candidates.find(
        (cand) => cand.table === 'instructors' && cand.id === c.teacher,
      )!.reviewed = true;
      const before = await snapshot();
      await expect(applyCleanup(plan, 'prisma_test')).rejects.toThrow('utilizados');
      expect(await snapshot()).toEqual(before);
    });
    it.each([
      'period_membership',
      'period_enrollment',
      'offering_enrollment',
      'schedule_enrollment',
      'instructor_assignment',
      'instructor_account',
    ])('concurrencia %s conserva operaciones válidas sin huérfanos', async (kind) => {
      const c = await config(),
        p = await person();
      if (kind !== 'period_membership')
        await post(`/periods/${c.pr}/memberships`, { person_id: p });
      // A period cannot be deleted while its membership exists. Test that
      // admission wins safely; the separate membership race covers deletion wins.
      const path = kind.startsWith('period')
        ? `/periods/${c.pr}`
        : kind.startsWith('offering')
          ? `/offerings/${c.offering}`
          : kind.startsWith('schedule')
            ? `/schedules/${c.schedule}`
            : `/instructors/${c.teacher}`;
      let write;
      if (kind === 'period_membership')
        write = agent.post(`/api/periods/${c.pr}/memberships`).send({ person_id: p });
      else if (kind === 'instructor_assignment')
        write = agent
          .put(`/api/schedules/${c.schedule}`)
          .send({
            offering_id: c.offering,
            day: 1,
            start: '10:00',
            end: '11:00',
            instructor_ids: [c.teacher],
          });
      else if (kind === 'instructor_account')
        write = agent
          .put('/api/facilitator-accounts')
          .send({ offering_id: c.offering, instructor_id: c.teacher, amount_due: null });
      else write = agent.post('/api/enrollments').send(enrollmentBody(c, p));
      const [deleted, written] = await Promise.all([remove(path), write]);
      const success = kind.startsWith('instructor') ? 200 : 201;
      const allowed =
        kind === 'instructor_assignment'
          ? [
              [200, 404],
              [200, 200],
            ]
          : [
              [200, 404],
              [200, 409],
              [200, 422],
              [409, success],
            ];
      expect(allowed).toContainEqual([deleted.status, written.status]);
      if (written.status === success && kind !== 'instructor_assignment')
        expect(deleted.status).toBe(409);
      if (kind === 'instructor_assignment')
        expect(
          await query('SELECT * FROM schedule_instructors WHERE instructor_id=?', [c.teacher]),
        ).toEqual([]);
      if (kind.endsWith('enrollment') && written.status === 201) {
        expect(
          await query('SELECT id FROM enrollments WHERE id=?', [written.body.id]),
        ).toHaveLength(1);
        expect(
          await query('SELECT id FROM enrollment_slots WHERE enrollment_id=?', [written.body.id]),
        ).toHaveLength(1);
      }
      expect(
        await query(
          'SELECT es.id FROM enrollment_slots es LEFT JOIN activity_schedules s ON s.id=es.schedule_id WHERE s.id IS NULL',
        ),
      ).toEqual([]);
      expect(
        await query(
          'SELECT si.schedule_id FROM schedule_instructors si LEFT JOIN instructors i ON i.id=si.instructor_id WHERE i.id IS NULL',
        ),
      ).toEqual([]);
      expect(
        await query(
          'SELECT c.id FROM facilitator_accounts c LEFT JOIN instructors i ON i.id=c.instructor_id LEFT JOIN period_activities o ON o.id=c.offering_id WHERE i.id IS NULL OR o.id IS NULL',
        ),
      ).toEqual([]);
    });
  });
}
