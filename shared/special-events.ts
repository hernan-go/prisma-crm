import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { money } from './domain.js';

const id = z.number().int().positive().max(4294967295);
const notes = z.string().trim().max(2000).default('');
export const eventStatusSchema = z.enum(['draft', 'confirmed', 'held', 'cancelled']);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const eventFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    location: z.string().trim().max(200).default(''),
    description: notes,
    date: z.iso.date(),
    start_time: time,
    end_time: time,
    price: money,
    capacity: z.number().int().positive().max(4294967295).nullable().default(null),
    notes,
  })
  .strict()
  .refine((v) => v.end_time > v.start_time, {
    path: ['end_time'],
    message: 'La hora final debe ser posterior al inicio.',
  });
export const eventCommandSchema = z
  .object({
    request_id: z.uuid(),
    expected_revision: id,
  })
  .strict();
export const eventCreateSchema = eventFieldsSchema.safeExtend({
  request_id: z.uuid(),
  period_id: id,
});
export const eventEditSchema = eventFieldsSchema.safeExtend(eventCommandSchema.shape);
export const eventStatusChangeSchema = eventCommandSchema.extend({
  status: eventStatusSchema,
  reason: notes,
});
export const eventDeleteSchema = eventCommandSchema.extend({
  reason: notes,
  reopen_period_ids: z.array(id).max(100).default([]),
});
export const eventRescheduleSchema = eventCommandSchema
  .extend({
    period_id: id,
    date: z.iso.date(),
    start_time: time,
    end_time: time,
    reason: z.string().trim().min(1).max(2000),
    expense_categories: z
      .array(z.object({ source_category_id: id, target_category_id: id }).strict())
      .max(100)
      .default([]),
  })
  .refine((v) => v.end_time > v.start_time, { path: ['end_time'], message: 'Horario inválido.' });
export const eventParticipantSchema = eventCommandSchema.extend({
  person_id: id,
  price: money,
  notes,
});
export const eventParticipantEditSchema = eventCommandSchema.extend({
  price: money,
  notes,
  active: z.boolean(),
});
export const eventMovementSchema = eventCommandSchema.extend({
  kind: z.enum(['collection', 'refund']),
  date: z.iso.date(),
  amount: money.refine((v) => new Decimal(v).gt(0), 'El importe debe ser mayor a cero.'),
  recipient: z.enum(['jesica', 'hernan']),
  method: z.enum(['cash', 'transfer']),
  notes,
});
export const eventVoidSchema = eventCommandSchema.extend({
  reason: z.string().trim().min(1).max(2000),
});
export interface EventMovement {
  id: number;
  participant_id: number;
  kind: 'collection' | 'refund';
  date: string;
  amount: string;
  recipient: 'jesica' | 'hernan';
  method: 'cash' | 'transfer';
  notes: string;
  voided_at: string | null;
  void_reason: string | null;
}
export interface EventParticipant {
  id: number;
  event_id: number;
  person_id: number;
  price: string;
  active: number;
  notes: string;
  nombre?: string;
  apellido?: string;
}
export interface EventReceipt {
  id: number;
  revision: number;
}
export type SpecialEvent = z.infer<typeof eventFieldsSchema> & {
  event_number: number;
  id: number;
  period_id: number;
  status: z.infer<typeof eventStatusSchema>;
  revision: number;
};
export type EventListItem = Pick<
  SpecialEvent,
  | 'id'
  | 'event_number'
  | 'period_id'
  | 'name'
  | 'date'
  | 'start_time'
  | 'end_time'
  | 'price'
  | 'capacity'
  | 'status'
  | 'revision'
>;
export type SpecialEventDetail = SpecialEvent &
  ReturnType<typeof calculateEventTotals> & {
    available: number | null;
    direct_expenses?: string;
    commercial_net?: string;
    expenses?: {
      id: number;
      category_id: number;
      category_name: string;
      period_id: number;
      concept: string;
      date: string;
      amount: string;
      notes: string;
    }[];
    movements: EventMovement[];
    history: { action: string; at: string; actor: string; result: EventReceipt }[];
  };

// Legacy refunds reduce original collections in stable ID order, never the refund wallet.
// This read projection preserves historical rows and cannot restore excluded payments.
export function commercialCollections(movements: EventMovement[]) {
  const Money = Decimal.clone({ precision: 40 });
  return [...new Set(movements.map((m) => m.participant_id))].flatMap((id) => {
    const own = movements.filter((m) => m.participant_id === id && !m.voided_at);
    let refunds = own
      .filter((m) => m.kind === 'refund')
      .reduce((s, m) => s.plus(m.amount), new Money(0));
    const rows = own
      .filter((m) => m.kind === 'collection')
      .sort((a, b) => a.id - b.id)
      .map((m) => {
        const deduction = Money.min(refunds, m.amount);
        refunds = refunds.minus(deduction);
        return { ...m, amount: new Money(m.amount).minus(deduction).toFixed(2) };
      });
    if (refunds.gt(0)) throw new Error('Reintegros superiores a cobros.');
    return rows;
  });
}

export function calculateEventTotals(participants: EventParticipant[], movements: EventMovement[]) {
  const Money = Decimal.clone({ precision: 40 });
  const balances = participants.map((p) => {
    const own = movements.filter((m) => m.participant_id === p.id && !m.voided_at);
    const sum = (kind: EventMovement['kind']) =>
      own.filter((m) => m.kind === kind).reduce((s, m) => s.plus(m.amount), new Money(0));
    const collected = sum('collection'),
      refunded = sum('refund');
    if (refunded.gt(collected)) throw new Error('Reintegros superiores a cobros.');
    const paid = collected.minus(refunded);
    return {
      ...p,
      collected: collected.toFixed(2),
      refunded: refunded.toFixed(2),
      paid: paid.toFixed(2),
      pending: p.active ? Money.max(new Money(p.price).minus(paid), 0).toFixed(2) : '0.00',
      excess: Money.max(paid.minus(p.price), 0).toFixed(2),
    };
  });
  const active = balances.filter((p) => p.active);
  const sum = (rows: typeof balances, field: 'paid' | 'pending') =>
    rows.reduce((s, p) => s.plus(p[field]), new Money(0)).toFixed(2);
  return {
    participants: balances,
    active_count: active.length,
    due: active.reduce((s, p) => s.plus(p.price), new Money(0)).toFixed(2),
    gross: sum(active, 'paid'),
    pending: sum(active, 'pending'),
    effective_net: sum(balances, 'paid'),
  };
}
