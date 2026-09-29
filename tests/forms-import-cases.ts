import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query } from '../server/db.js';

// Runs inside the existing prisma_test lifecycle, with its own authenticated app instance.
export function formsImportTests(agent: any, password: string) {
  describe('Forms: email y correspondencia simplificada', () => {
    let period: number;
    const neutralPayment = {
      original: '',
      amount: '',
      method: '',
      date: '',
      include: false,
      approved: false,
    };
    const headers =
      'Marca temporal;Nombre de usuario;Nombre Completo.;D.N.I;Número de Teléfono (con código de área);Dirección;Nuestros horarios;Recordatorio;Pago;Turno mañana;Turno tarde';
    const csv = (email = 'forms.iteracion1@example.invalid') =>
      `${headers}\n29/09/2026 10:00;${email};Importación Sintética;;0000092911;;Entendido;De acuerdo;25000 T 23/4;;`;
    const preview = async (source: string, mapping?: Record<string, number>) => {
      let req = agent.post('/api/forms-import/preview').field('period_id', String(period));
      if (mapping) req = req.field('mapping', JSON.stringify(mapping));
      const result = await req.attach('file', Buffer.from(source), 'synthetic-forms.csv');
      expect(result.status, result.body.message).toBe(200);
      return result.body;
    };
    const commit = (row: any) =>
      agent
        .post('/api/forms-import/commit')
        .send({ period_id: period, request_id: randomUUID(), confirmed: true, rows: [row] });
    beforeAll(async () => {
      expect((await agent.post('/api/auth/login').send({ password })).status).toBe(200);
      const result = await agent.post('/api/periods').send({ year: 2031, month: 1 });
      expect(result.status).toBe(201);
      period = result.body.id;
    });
    it('preview lleva Nombre de usuario a person.email y no escribe ni interpreta aceptaciones/pagos', async () => {
      const before = await query('SELECT COUNT(*) n FROM people');
      const result = await preview(csv());
      expect(result.mapping.email).toBe(1);
      const row = result.rows[0];
      expect(row.person.email).toBe('forms.iteracion1@example.invalid');
      expect(row.valid).toBe(true);
      expect(row.selections).toEqual([]);
      expect(row.payment).toEqual(neutralPayment);
      expect(row).not.toHaveProperty('context');
      for (const key of ['timestamp', 'hours', 'reminder', 'payment']) {
        expect(result.mapping).not.toHaveProperty(key);
        expect(row.person).not.toHaveProperty(key);
      }
      expect(await query('SELECT COUNT(*) n FROM people')).toEqual(before);
    });
    it('ignora campos retirados incluso si un mapping manual anterior los envía', async () => {
      const result = await preview(csv(), {
        email: 1,
        full_name: 2,
        telefono: 4,
        timestamp: 0,
        hours: 6,
        reminder: 7,
        payment: 8,
      });
      expect(result.rows[0].selections).toEqual([]);
      expect(result.rows[0].payment).toEqual(neutralPayment);
      expect(result.rows[0]).not.toHaveProperty('context');
      expect(Object.keys(result.mapping)).not.toEqual(
        expect.arrayContaining(['timestamp', 'hours', 'reminder', 'payment']),
      );
      expect(result.mapping.email).toBe(1);
    });
    it('ambos turnos siguen generando opciones revisables sin inventar horarios', async () => {
      const source =
        'Nombre Completo.;Teléfono;Turno mañana;Turno tarde;Nuestros horarios\nTurnos Sintéticos;0000092922;Taller mañana Lunes 10 a 11 hs;Taller tarde Viernes 16 a 17 hs;Entendido';
      const result = await preview(source);
      expect(result.rows[0].selections.map((s: any) => s.original)).toEqual([
        'Taller mañana Lunes 10 a 11 hs',
        'Taller tarde Viernes 16 a 17 hs',
      ]);
      expect(
        result.rows[0].selections.every(
          (s: any) => s.schedule_id === 0 && s.resolution === 'missing',
        ),
      ).toBe(true);
      expect((await agent.get(`/api/offerings?period_id=${period}`)).body).toEqual([]);
    });
    it('crea, detecta duplicados, conserva y actualiza email sin generar pagos desde CSV', async () => {
      const paymentsBefore = await query('SELECT * FROM payments ORDER BY id');
      const accountsBefore = await query('SELECT * FROM monthly_accounts ORDER BY id');
      const first = (await preview(csv())).rows[0];
      expect((await commit(first)).status).toBe(422);
      first.reviewed = true;
      const created = await commit(first);
      expect(created.status).toBe(200);
      expect(created.body).toMatchObject({ created: 1, enrollments: 0, payments: 0 });
      const duplicate = (await preview(csv())).rows[0];
      expect(duplicate.action).toBe('skip');
      expect(duplicate.matches).toHaveLength(1);
      const id = duplicate.matches[0].id;
      expect((await agent.get(`/api/people/${id}`)).body.email).toBe(first.person.email);
      duplicate.action = 'keep';
      duplicate.reviewed = true;
      duplicate.person.email = 'ignorado@example.invalid';
      const kept = await commit(duplicate);
      expect(kept.status).toBe(200);
      expect(kept.body.kept).toBe(1);
      expect((await agent.get(`/api/people/${id}`)).body.email).toBe(first.person.email);
      const updated = (await preview(csv('actualizado@example.invalid'))).rows[0];
      updated.action = 'update';
      updated.reviewed = true;
      const result = await commit(updated);
      expect(result.status).toBe(200);
      expect(result.body.updated).toBe(1);
      expect((await agent.get(`/api/people/${id}`)).body.email).toBe('actualizado@example.invalid');
      expect(await query('SELECT * FROM payments ORDER BY id')).toEqual(paymentsBefore);
      expect(await query('SELECT * FROM monthly_accounts ORDER BY id')).toEqual(accountsBefore);
    });
  });
}
