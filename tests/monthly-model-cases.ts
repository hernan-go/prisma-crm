import { describe, it, expect, beforeAll } from 'vitest';
import { query } from '../server/db.js';
import { randomUUID } from 'node:crypto';
import { incorporateTestPerson } from './model-fixtures.js';
// Registered inside the existing DB suite: same isolated database and lifecycle, no parallel resets.
export function monthlyModelTests(agent: any, password: string) {
  describe('Oferta mensual y facilitadores normalizados', () => {
    beforeAll(async () => {
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
    });
    let sep: number,
      oct: number,
      nov: number,
      a: number,
      b: number,
      individual: number,
      f1: number,
      f2: number,
      f3: number,
      off: number,
      group: number,
      p1: number,
      p2: number;
    const post = async (path: string, body: any) => {
      const r = await agent.post('/api' + path).send(body);
      expect(r.status, r.body.message).toBe(201);
      return r.body.id;
    };
    const offer = (period: number, activity: number, mode = 'group') =>
      post('/offerings', { period_id: period, activity_id: activity, mode, days: [1, 3, 5] });
    const slot = (
      offering_id: number,
      instructor_ids: number[],
      day = 1,
      start = '10:00',
      end = '11:00',
    ) => post('/schedules', { offering_id, instructor_ids, day, start, end });
    const enroll = async (
      person_id: number,
      activity_id: number,
      schedule_ids: number[],
      period_id = sep,
    ) => {
      await incorporateTestPerson(agent, person_id, period_id);
      return agent
        .post('/api/enrollments')
        .send({ person_id, activity_id, schedule_ids, period_id });
    };
    it('crea facilitador solo con nombre, sin inventar opcionales', async () => {
      sep = await post('/periods', { year: 2030, month: 9 });
      oct = await post('/periods', { year: 2030, month: 10 });
      nov = await post('/periods', { year: 2030, month: 11 });
      f1 = await post('/instructors', { name: 'Facilitador A' });
      const i = (await agent.get('/api/instructors')).body.find((i: any) => i.id === f1);
      expect(i).toMatchObject({
        surname: '',
        dni: '',
        phone: '',
        email: '',
        address: '',
        active: 1,
      });
    });
    it('permite todos los campos y documentos/contactos repetidos', async () => {
      const v = {
        name: 'Facilitador B',
        surname: 'Apellido sintético',
        dni: '00.000.000',
        phone: '',
        email: 'qa@example.invalid',
        address: 'Dirección sintética',
      };
      f2 = await post('/instructors', v);
      f3 = await post('/instructors', { ...v, name: 'Facilitador C' });
      expect(
        (
          await agent
            .put(`/api/instructors/${f3}`)
            .send({ name: 'Facilitador C', surname: '', email: '' })
        ).status,
      ).toBe(200);
      expect(
        (
          await agent
            .put(`/api/instructors/${f3}`)
            .send({ name: 'Facilitador C', email: 'incorrecto' })
        ).status,
      ).toBe(422);
      expect((await agent.post('/api/instructors').send({ name: '' })).status).toBe(422);
    });
    it('actividad en septiembre, ausente en octubre, nuevamente en noviembre', async () => {
      a = await post('/activities', {
        name: 'Oferta intermitente QA',
        mode: 'group',
        days: [1, 3, 5],
      });
      b = await post('/activities', { name: 'Otra oferta QA', days: [1, 3, 5] });
      individual = await post('/activities', {
        name: 'Individual QA',
        mode: 'individual',
        days: [1, 3, 5],
      });
      off = await offer(sep, a);
      await offer(nov, a);
      expect((await agent.get(`/api/offerings?period_id=${oct}`)).body).toHaveLength(0);
      expect((await agent.get(`/api/offerings?period_id=${nov}`)).body[0].activity_id).toBe(a);
      p1 = await post('/people', {
        nombre: 'Modelo',
        apellido: 'Prueba Uno',
        telefono: '0000077001',
      });
      p2 = await post('/people', {
        nombre: 'Modelo',
        apellido: 'Prueba Dos',
        telefono: '0000077002',
      });
      expect((await enroll(p1, a, [1], oct)).status).toBe(409);
    });
    it('horario con tres facilitadores y grupo con varios asistentes', async () => {
      group = await slot(off, [f1, f2, f3]);
      expect((await enroll(p1, a, [group])).status).toBe(201);
      expect((await enroll(p2, a, [group])).status).toBe(201);
      const agenda = (await agent.get(`/api/agenda?period_id=${sep}`)).body;
      expect(agenda.find((h: any) => h.id === group).people).toHaveLength(2);
      expect(agenda.find((h: any) => h.id === group).instructors).toHaveLength(3);
      expect(await query('SELECT id FROM activity_schedules WHERE id=?', [group])).toHaveLength(1);
    });
    it('agenda filtra por cualquiera de los tres facilitadores', async () => {
      for (const f of [f1, f2, f3])
        expect(
          (
            await agent.get(
              `/api/agenda?period_id=${sep}&instructor_id=${f}&activity_id=${a}&day=1&start=10:00`,
            )
          ).body.map((h: any) => h.id),
        ).toContain(group);
    });
    it('facilitadores diferentes por día y por horario, sin inferir del catálogo', async () => {
      await slot(off, [f2], 5);
      await slot(off, [f3], 1, '14:00', '15:00');
      const schedule = (await agent.get(`/api/agenda?period_id=${sep}`)).body;
      expect(
        schedule
          .find((h: any) => h.offering_id === off && h.day === 5)
          .instructors.map((i: any) => i.id),
      ).toEqual([f2]);
      expect(
        schedule
          .find((h: any) => h.offering_id === off && h.start === '14:00')
          .instructors.map((i: any) => i.id),
      ).toEqual([f3]);
    });
    it('rechaza si uno solo de varios facilitadores está ocupado', async () => {
      const other = await offer(sep, b);
      const r = await agent
        .post('/api/schedules')
        .send({ offering_id: other, day: 1, start: '10:30', end: '11:30', instructor_ids: [f3] });
      expect(r.status).toBe(409);
      const free = await slot(other, [], 1);
      expect((await enroll(p1, b, [free])).status).toBe(409);
    });
    it('individual admite horarios y facilitadores distintos, pero no doble reserva', async () => {
      const o = await offer(sep, individual, 'individual');
      const h1 = await slot(o, [f1], 3, '11:00', '12:30');
      const h2 = await slot(o, [f2], 3, '14:00', '15:00');
      expect((await enroll(p1, individual, [h1])).status).toBe(201);
      expect((await enroll(p2, individual, [h1])).status).toBe(409);
      expect((await enroll(p2, individual, [h2])).status).toBe(201);
    });
    it('impide editar destructivamente horario utilizado', async () => {
      expect(
        (
          await agent.put(`/api/schedules/${group}`).send({
            offering_id: off,
            day: 1,
            start: '09:00',
            end: '10:00',
            instructor_ids: [f1, f2, f3],
          })
        ).status,
      ).toBe(409);
    });
    it('oferta futura y cambios del catálogo no reescriben historia', async () => {
      const old = (await agent.get(`/api/enrollments?period_id=${sep}`)).body;
      const future = await offer(oct, a);
      await slot(future, [f2], 5, '18:00', '19:00');
      expect(
        (
          await agent
            .put(`/api/offerings/${future}`)
            .send({ period_id: oct, activity_id: a, mode: 'group', days: [1, 3, 5], active: false })
        ).status,
      ).toBe(200);
      expect(
        (
          await agent
            .put(`/api/activities/${a}`)
            .send({ name: 'Nombre futuro', mode: 'individual', active: false, days: [] })
        ).status,
      ).toBe(200);
      expect(
        (await agent.put(`/api/instructors/${f1}`).send({ name: 'Nombre futuro', active: false }))
          .status,
      ).toBe(200);
      expect((await agent.get(`/api/enrollments?period_id=${sep}`)).body).toEqual(
        old.map((e: any) => ({
          ...e,
          slots: e.slots.map((s: any) => ({
            ...s,
            instructors: s.instructors.map((i: any) => (i.id === f1 ? { ...i, active: 0 } : i)),
          })),
        })),
      );
      expect(
        (await agent.get(`/api/enrollments?period_id=${sep}`)).body.find(
          (e: any) => e.activity_id === a,
        ).activity,
      ).toBe('Oferta intermitente QA');
    });
    it('inactivo visible en historial pero no en nuevas asignaciones', async () => {
      const o = await offer(oct, b);
      expect(
        (
          await agent
            .post('/api/schedules')
            .send({ offering_id: o, day: 1, start: '09:00', end: '10:00', instructor_ids: [f1] })
        ).status,
      ).toBe(409);
      const h = (await agent.get(`/api/agenda?period_id=${sep}`)).body.find(
        (h: any) => h.id === group,
      );
      expect(h.instructors.find((i: any) => i.id === f1).name).toBe('Facilitador A');
    });
    it('DELETE seguro y sin perder referencias históricas', async () => {
      expect((await agent.delete(`/api/instructors/${f1}`)).status).toBe(409);
      expect((await agent.delete(`/api/activities/${a}`)).status).toBe(409);
      const unused = await post('/instructors', { name: 'Sin uso' });
      expect((await agent.delete(`/api/instructors/${unused}`)).status).toBe(200);
      const empty = await post('/activities', { name: 'Sin uso' });
      expect((await agent.delete(`/api/activities/${empty}`)).status).toBe(200);
    });
    it('una oferta deshabilitada sin asistentes libera al facilitador y reactivarla valida conflictos', async () => {
      const c = await post('/activities', { name: 'Reactivación QA' });
      const d = await post('/activities', { name: 'Reserva QA' });
      const first = await offer(nov, c),
        second = await offer(nov, d);
      await slot(first, [f2], 3, '19:00', '20:00');
      const value = {
        period_id: nov,
        activity_id: c,
        mode: 'group',
        days: [1, 3, 5],
        active: false,
      };
      expect((await agent.put(`/api/offerings/${first}`).send(value)).status).toBe(200);
      const other = await slot(second, [f2], 3, '19:00', '20:00');
      expect(
        (await agent.put(`/api/offerings/${first}`).send({ ...value, active: true })).status,
      ).toBe(409);
      expect(
        (
          await agent.put(`/api/schedules/${other}`).send({
            offering_id: second,
            instructor_ids: [f2],
            day: 3,
            start: '19:00',
            end: '20:00',
            active: false,
          })
        ).status,
      ).toBe(200);
      expect(
        (await agent.put(`/api/offerings/${first}`).send({ ...value, active: true })).status,
      ).toBe(200);
    });
    it('dashboard conserva el nombre de la oferta histórica tras renombrar el catálogo', async () => {
      const dashboard = (await agent.get(`/api/dashboard?period_id=${sep}`)).body;
      expect(dashboard.activities.find((x: any) => x.name === 'Oferta intermitente QA').count).toBe(
        2,
      );
      expect(dashboard.activities.some((x: any) => x.name === 'Nombre futuro')).toBe(false);
    });
    it('conserva horarios históricos deshabilitados al editar y bloquea nuevas admisiones', async () => {
      expect(
        (
          await agent.put(`/api/schedules/${group}`).send({
            offering_id: off,
            day: 1,
            start: '10:00',
            end: '11:00',
            instructor_ids: [f1, f2, f3],
            active: false,
          })
        ).status,
      ).toBe(200);
      const old = (await agent.get(`/api/enrollments?period_id=${sep}`)).body.find(
        (e: any) => e.person_id === p1 && e.activity_id === a,
      );
      expect(
        (
          await agent
            .put(`/api/enrollments/${old.id}`)
            .send({ person_id: p1, activity_id: a, period_id: sep, schedule_ids: [group] })
        ).status,
      ).toBe(200);
      expect((await enroll(p2, a, [group])).status).toBe(409);
      const occupied = await post('/activities', { name: 'Reserva histórica QA' });
      const o = await offer(sep, occupied);
      expect(
        (
          await agent
            .post('/api/schedules')
            .send({ offering_id: o, instructor_ids: [f3], day: 1, start: '10:00', end: '11:00' })
        ).status,
      ).toBe(409);
    });
    it('Forms usa horarios mensuales y nunca crea facilitadores', async () => {
      const o = (await agent.get(`/api/offerings?period_id=${oct}`)).body.find(
        (o: any) => o.activity_id === b,
      );
      const h = await slot(o.id, [f2, f3], 3, '16:00', '17:00');
      const before = await query('SELECT * FROM instructors ORDER BY id');
      const csv =
        'Nombre Completo.;Número de Teléfono (con código de área);Turno mañana\nForms Modelo;0000077099;Otra oferta QA Miércoles 16 a 17 hs';
      const row = (
        await agent
          .post('/api/forms-import/preview')
          .field('period_id', String(oct))
          .attach('file', Buffer.from(csv), 'synthetic.csv')
      ).body.rows[0];
      expect(row.selections[0].schedule_id).toBe(h);
      expect(row.selections[0].instructor_ids.sort()).toEqual([f2, f3].sort());
      row.reviewed = true;
      expect(
        (
          await agent
            .post('/api/forms-import/commit')
            .send({ period_id: oct, request_id: randomUUID(), confirmed: true, rows: [row] })
        ).status,
      ).toBe(200);
      expect(await query('SELECT * FROM instructors ORDER BY id')).toEqual(before);
    });
    it('Forms deja pendientes configuraciones inexistentes y ambiguas', async () => {
      const o = (await agent.get(`/api/offerings?period_id=${oct}`)).body.find(
        (o: any) => o.activity_id === b,
      );
      await slot(o.id, [], 1, '18:00', '19:00');
      await slot(o.id, [], 1, '18:00', '19:00');
      for (const [hours, resolution] of [
        ['Lunes 18 a 19 hs', 'ambiguous'],
        ['Viernes 09 a 10 hs', 'missing'],
      ]) {
        const csv = `Nombre Completo.;Número de Teléfono (con código de área);Turno mañana\nForms Pendiente;0000077088;Otra oferta QA ${hours}`;
        const row = (
          await agent
            .post('/api/forms-import/preview')
            .field('period_id', String(oct))
            .attach('file', Buffer.from(csv), 'synthetic.csv')
        ).body.rows[0];
        expect(row.selections[0]).toMatchObject({ schedule_id: 0, resolution });
        row.reviewed = true;
        expect(
          (
            await agent
              .post('/api/forms-import/commit')
              .send({ period_id: oct, request_id: randomUUID(), confirmed: true, rows: [row] })
          ).status,
        ).toBe(422);
      }
    });
    it('rollback completo de lote: persona y pago anterior al conflicto se revierten', async () => {
      const o = (await agent.get(`/api/offerings?period_id=${oct}`)).body.find(
        (o: any) => o.activity_id === b,
      );
      const schedule = o.schedules.find((s: any) => s.start === '16:00');
      const row = (name: string, phone: string) => ({
        person: { nombre: name, apellido: 'Sintética', telefono: phone },
        action: 'create',
        reviewed: true,
        selections: [
          {
            original: '',
            include: true,
            activity_id: b,
            schedule_id: schedule.id,
            day: schedule.day,
            start: schedule.start,
            end: schedule.end,
            instructor_ids: [f2, f3],
          },
        ],
        payment: {
          include: true,
          method: 'cash',
          recipient: 'jesica',
          date: '2030-10-01',
          amount: '25',
        },
      });
      const first = row('Rollback A', '0000077071'),
        second = row('Rollback B', '0000077072');
      second.selections[0].instructor_ids = [f1];
      const payments = await query('SELECT * FROM payments ORDER BY id');
      expect(
        (
          await agent.post('/api/forms-import/commit').send({
            period_id: oct,
            request_id: randomUUID(),
            confirmed: true,
            rows: [first, second],
          })
        ).status,
      ).toBe(409);
      expect((await agent.get('/api/people?q=0000077071')).body.total).toBe(0);
      expect(await query('SELECT * FROM payments ORDER BY id')).toEqual(payments);
    });
  });
}
