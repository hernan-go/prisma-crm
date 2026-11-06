import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  calculateEventTotals,
  eventCreateSchema,
  eventMovementSchema,
  eventParticipantSchema,
  eventRescheduleSchema,
  eventVoidSchema,
  type EventMovement,
  type EventParticipant,
} from '../shared/special-events';
import { importPersonSchema, personSchema } from '../shared/domain';
import { mapRow, strongMatch } from '../server/importer';
import { formRowSchema } from '../shared/forms';

const command = { request_id: randomUUID(), expected_revision: 1 };
const base = {
  request_id: randomUUID(),
  period_id: 1,
  name: 'Charla',
  date: '2026-12-05',
  start_time: '18:15',
  end_time: '21:45',
  price: '100.20',
  capacity: null,
};
const participant = (id: number, active = 1, price = '100.20'): EventParticipant => ({
  id,
  event_id: 1,
  person_id: id,
  price,
  active,
  notes: '',
});
const movement = (
  id: number,
  participant_id: number,
  kind: 'collection' | 'refund',
  amount: string,
  voided_at: string | null = null,
): EventMovement => ({
  id,
  participant_id,
  kind,
  amount,
  date: '2026-11-01',
  recipient: 'jesica',
  method: 'transfer',
  notes: '',
  voided_at,
  void_reason: voided_at ? 'Error' : null,
});
describe('Eventos: contratos y cálculos económicos', () => {
  it('acepta horarios propios, precio cero y cupo opcional; rechaza datos inválidos o no previstos', () => {
    expect(eventCreateSchema.safeParse(base).success).toBe(true);
    expect(eventCreateSchema.safeParse({ ...base, price: '0' }).success).toBe(true);
    for (const change of [
      { end_time: '18:15' },
      { start_time: '24:00' },
      { date: '2026-02-30' },
      { price: '1.001' },
      { price: '10000000000' },
      { capacity: 0 },
      { status: 'held' },
      { period_id: 0 },
    ])
      expect(eventCreateSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
  it('exige clave, revisión, receptor y medio independientes para dinero real', () => {
    const body = {
      ...command,
      kind: 'collection',
      date: '2026-11-01',
      amount: '0.10',
      recipient: 'hernan',
      method: 'cash',
    };
    expect(eventMovementSchema.safeParse(body).success).toBe(true);
    for (const change of [
      { request_id: 'no' },
      { expected_revision: 0 },
      { amount: '0' },
      { amount: '-10' },
      { recipient: undefined },
      { method: undefined },
      { kind: 'void' },
      { account_id: 1 },
    ])
      expect(eventMovementSchema.safeParse({ ...body, ...change }).success).toBe(false);
    expect(eventVoidSchema.safeParse({ ...command, reason: '' }).success).toBe(false);
    expect(eventParticipantSchema.safeParse({ ...command, person_id: 1, price: '0' }).success).toBe(
      true,
    );
    expect(
      eventRescheduleSchema.safeParse({
        ...command,
        period_id: 2,
        date: base.date,
        start_time: '20:00',
        end_time: '19:00',
        reason: 'Nueva fecha',
      }).success,
    ).toBe(false);
  });
  it('separa participación comercial y dinero conservado de retirados, sin compensar personas', () => {
    const result = calculateEventTotals(
      [participant(1), participant(2, 0), participant(3, 1, '0'), participant(4)],
      [
        movement(1, 1, 'collection', '60.10'),
        movement(2, 1, 'collection', '50.20'),
        movement(3, 1, 'refund', '10.10'),
        movement(4, 2, 'collection', '100.20'),
        movement(5, 2, 'refund', '20.10'),
        movement(6, 4, 'collection', '100.20', '2026-11-01'),
      ],
    );
    expect(result).toMatchObject({
      active_count: 3,
      gross: '100.20',
      pending: '100.20',
      effective_net: '180.30',
    });
    expect(result.participants[1]).toMatchObject({ paid: '80.10', pending: '0.00' });
    expect(result.participants[2]).toMatchObject({ paid: '0.00', pending: '0.00' });
  });
  it('conserva sobrepago al reducir el precio; no inventa devolución', () => {
    expect(
      calculateEventTotals([participant(1, 1, '50')], [movement(1, 1, 'collection', '100.20')])
        .participants[0],
    ).toMatchObject({ paid: '100.20', pending: '0.00', excess: '50.20' });
    expect(() => calculateEventTotals([participant(1)], [movement(1, 1, 'refund', '1')])).toThrow();
  });
  it('conserva precisión en agregados superiores a un importe individual', () => {
    expect(
      calculateEventTotals(
        [participant(1)],
        [movement(1, 1, 'collection', '9999999999.99'), movement(2, 1, 'collection', '0.02')],
      ).gross,
    ).toBe('10000000000.01');
  });
});
describe('Persona sin teléfono: catálogo flexible, importaciones conservadoras', () => {
  const person = { nombre: 'Ana', apellido: 'Prueba', telefono: '' };
  it('acepta ausencia, espacios o campo omitido sin aceptar un teléfono informado inválido', () => {
    expect(personSchema.parse({ nombre: 'Ana', apellido: 'Prueba' }).telefono).toBe('');
    expect(personSchema.parse({ ...person, telefono: '  ' }).telefono).toBe('');
    expect(personSchema.safeParse({ ...person, telefono: 'abc' }).success).toBe(false);
    expect(
      strongMatch(personSchema.parse(person), personSchema.parse({ ...person, nombre: 'Otra' })),
    ).toBe(false);
    expect(
      strongMatch(
        personSchema.parse({ ...person, dni: '123' }),
        personSchema.parse({ ...person, dni: '123' }),
      ),
    ).toBe(true);
  });
  it('no relaja importación de Personas ni confirmación Forms', () => {
    expect(importPersonSchema.safeParse(person).success).toBe(false);
    expect(mapRow(['Ana', 'Prueba', ''], { nombre: 0, apellido: 1, telefono: 2 }).valid).toBe(
      false,
    );
    const row = {
      person,
      action: 'create',
      reviewed: true,
      selections: [],
      payment: { include: false, amount: '', method: '', date: '' },
    };
    expect(formRowSchema.safeParse(row).success).toBe(false);
    expect(
      formRowSchema.safeParse({ ...row, person: { ...person, telefono: '3411234567' } }).success,
    ).toBe(true);
  });
});
