import { z } from 'zod';
const statisticsPeriodSchema = z.object({
  id: z.number().int().positive(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(['open', 'closed']),
});
export const signedMoney = z.string().regex(/^-?\d+\.\d{2}$/);
const count = z.number().int().nonnegative();
const wallet = z.object({ cash: signedMoney, transfer: signedMoney, total: signedMoney });
export const eventEconomySchema = z.object({
  version: z.literal('1.0'),
  period: statisticsPeriodSchema,
  as_of: z.iso.datetime(),
  time_axis: z.literal('economic_period'),
  currency: z.literal('ARS'),
  income: z.object({
    workshops: signedMoney,
    event_collections: signedMoney,
    event_refunds: signedMoney,
    events: signedMoney,
    total: signedMoney,
  }),
  event_expenses: signedMoney,
  commercial_gross: signedMoney,
  commercial_pending: signedMoney,
  commercial_result: signedMoney,
  events: z.array(
    z.object({
      recorded: z
        .object({
          administratively_excluded_collections: signedMoney,
          administratively_excluded_refunds: signedMoney,
          collections: signedMoney,
          refunds: signedMoney,
          voided_collections: signedMoney,
          voided_refunds: signedMoney,
          excluded_valid_net: signedMoney,
        })
        .optional(),
      id: z.number().int().positive(),
      event_number: z.number().int().positive(),
      cancelled_at: z.string().nullable(),
      cancelled_participants: count.nullable(),
      cancellation_reason: z.string().nullable(),
      wallets: z.object({ jesica: wallet, hernan: wallet }),
      name: z.string(),
      date: z.string(),
      status: z.enum(['draft', 'confirmed', 'held', 'cancelled']),
      active_count: count,
      registered_count: count,
      withdrawn_count: count,
      collections: signedMoney,
      refunds: signedMoney,
      effective_net: signedMoney,
      direct_expenses: signedMoney,
      commercial: z
        .object({
          due: signedMoney,
          balance: signedMoney,
          gross: signedMoney,
          pending: signedMoney,
          result: signedMoney,
        })
        .nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type EventEconomy = z.infer<typeof eventEconomySchema>;
