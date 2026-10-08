import { z } from 'zod';
import { Decimal } from 'decimal.js';
export const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const times = Array.from(
  { length: 23 },
  (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);
export const normalizePhone = (s: string) =>
  s
    .replace(/\D/g, '')
    .replace(/^549(?=\d{10}$)/, '')
    .replace(/^54(?=\d{10}$)/, '');
export const normalizeDni = (s: string) => s.replace(/[^0-9a-z]/gi, '').toUpperCase();
export const money = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Ingresá un importe positivo con hasta dos decimales.');
const text = z.string().trim().max(2000).default('');
export const personSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(100),
  apellido: z.string().trim().min(1, 'El apellido es obligatorio.').max(100),
  telefono: z
    .string()
    .trim()
    .min(1, 'El teléfono es obligatorio.')
    .max(60)
    .refine((v) => v.replace(/\D/g, '').length >= 6, 'Ingresá al menos 6 dígitos.'),
  dni: z.string().trim().max(30).default(''),
  email: z.union([z.literal(''), z.email('Email inválido.')]).default(''),
  direccion: text,
  observaciones: text,
  activo: z.boolean().default(true),
  emergency_name: text,
  emergency_relationship: text,
  emergency_phone: text,
  emergency_notes: text,
});
export type PersonInput = z.infer<typeof personSchema>;
export const periodSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});
export const periodCreateSchema = periodSchema
  .extend({
    mode: z.enum(['empty', 'clone_previous']).default('empty'),
  })
  .strict();
export const slotSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.string().refine((v) => times.includes(v), 'Horario fuera del rango 09:00–20:00.'),
    end: z.string().refine((v) => times.includes(v), 'Horario fuera del rango 09:00–20:00.'),
  })
  .refine((v) => v.end > v.start, {
    message: 'La hora final debe ser posterior al inicio.',
    path: ['end'],
  });
export const enrollmentSchema = z.object({
  person_id: z.number().int().positive(),
  period_id: z.number().int().positive(),
  activity_id: z.number().int().positive(),
  schedule_ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(30)
    .refine((v) => new Set(v).size === v.length, 'Hay horarios repetidos.'),
});
export const offeringSchema = z.object({
  period_id: z.number().int().positive(),
  activity_id: z.number().int().positive(),
  mode: z.enum(['group', 'individual']),
  active: z.boolean().default(true),
  days: z.array(z.number().int().min(0).max(6)).refine((v) => new Set(v).size === v.length),
});
export const scheduleSchema = slotSchema.safeExtend({
  offering_id: z.number().int().positive(),
  instructor_ids: z.array(z.number().int().positive()).refine((v) => new Set(v).size === v.length),
  active: z.boolean().default(true),
});
export const facilitatorName = (i: { name: string; surname?: string }) =>
  [i.name, i.surname].filter(Boolean).join(' ');
export const paymentSchema = z.object({
  person_id: z.number().int().positive(),
  period_id: z.number().int().positive(),
  date: z.iso.date(),
  amount: money.refine((v) => new Decimal(v).gt(0), 'El pago debe ser mayor a cero.'),
  method: z.enum(['cash', 'transfer']),
  recipient: z.enum(['jesica', 'hernan']),
  notes: text,
});
export type PaymentInput = z.infer<typeof paymentSchema>;
export type PaymentRecipient = PaymentInput['recipient'];
export type PaymentMethod = PaymentInput['method'];
export interface Payment extends PaymentInput {
  id: number;
  account_id: number;
}
export interface WalletTotals {
  cash: string;
  transfer: string;
  total: string;
}
export type PeriodWallets = Record<PaymentRecipient, WalletTotals>;
export const recipientLabel = (recipient: PaymentRecipient) =>
  ({ jesica: 'Jésica', hernan: 'Hernán' })[recipient];
export const paymentMethodLabel = (method: PaymentMethod) =>
  ({ cash: 'Efectivo', transfer: 'Transferencia' })[method];
export const instructorSchema = z.object({
  name: z.string().trim().min(1).max(100),
  surname: z.string().trim().max(100).default(''),
  dni: z.string().trim().max(30).default(''),
  phone: z.string().trim().max(60).default(''),
  email: z.union([z.literal(''), z.email('Email inválido.')]).default(''),
  address: text,
  active: z.boolean().default(true),
});
export const activitySchema = z.object({
  mode: z.enum(['group', 'individual']).default('group'),
  name: z.string().trim().min(1).max(180),
  active: z.boolean().default(true),
  days: z
    .array(z.number().int().min(0).max(6))
    .default([0, 1, 2, 3, 4, 5, 6])
    .refine((v) => new Set(v).size === v.length),
});
export const advertisingSchema = z.object({
  date: z.iso.date(),
  concept: z.string().trim().min(1, 'El concepto es obligatorio.').max(200),
  amount: money,
  notes: text,
});
export const sumMoney = (values: string[]) =>
  values.reduce((n, v) => n.plus(v), new Decimal(0)).toFixed(2);
export const balance = (due: string | null, paid: string) =>
  due === null ? null : new Decimal(due).minus(paid).toFixed(2);
export const formatMoney = (value: string | number | null) =>
  value === null
    ? 'No definido'
    : new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(Number(value));
export function validateDays(slots: { day: number }[], allowed: number[]) {
  return slots.every((s) => allowed.includes(s.day));
}
export const formatDate = (value: string | null | undefined) => {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};
