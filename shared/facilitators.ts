import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { money, paymentSchema } from './domain.js';

export const facilitatorAccountSchema = z.object({
  offering_id: z.number().int().positive(),
  instructor_id: z.number().int().positive(),
  amount_due: money.nullable(),
  notes: z.string().trim().max(2000).default(''),
});
export const facilitatorPaymentSchema = paymentSchema.pick({
  date: true,
  amount: true,
  notes: true,
});
export const facilitatorPending = (due: string | null, paid: string) =>
  due === null ? null : Decimal.max(new Decimal(due).minus(paid), 0).toFixed(2);
export interface FacilitatorAccount {
  id: number | null;
  offering_id: number;
  instructor_id: number;
  instructor: string;
  activity: string;
  amount_due: string | null;
  notes: string;
  paid: string;
  pending: string | null;
  assigned: number;
}
export interface FacilitatorPayment {
  id: number;
  account_id: number;
  date: string;
  amount: string;
  notes: string;
}
