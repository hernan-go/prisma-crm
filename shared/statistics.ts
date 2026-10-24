import { z } from 'zod';

const count = z.number().int().nonnegative();
export const exactAmount = z.string().regex(/^\d+\.\d{2}$/);
export const statisticsPeriodSchema = z.object({
  id: z.number().int().positive(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(['open', 'closed']),
});
export const metricSchema = z.object({
  value: exactAmount,
  coverage: z.enum(['complete', 'partial', 'undefined', 'empty']),
  universe: count,
  defined: count,
  undefined: count,
  missing: count,
  period_id: z.number().int().positive(),
  time_axis: z.literal('economic_period'),
  source: z.array(z.string()),
  warnings: z.array(z.string()),
});
export const statisticsSummarySchema = z.object({
  version: z.literal(1),
  period: statisticsPeriodSchema,
  as_of: z.iso.datetime(),
  empty: z.boolean(),
  metrics: z.object({
    due: metricSchema,
    collected: metricSchema,
    debt: metricSchema,
    credit: metricSchema,
    fees_committed: metricSchema,
    fees_paid: metricSchema,
    fees_pending: metricSchema,
    expenses: metricSchema,
  }),
  fees_overpaid: z.object({ count, excess: exactAmount }),
  // Additive v1 extension. Older summaries remain readable, never treated as zero.
  collections: z
    .object({
      applied_known: exactAmount,
      collected_undefined: exactAmount,
      covered_percentage: z
        .string()
        .regex(/^(?:100\.00|(?:\d|[1-9]\d)\.\d{2})$/)
        .nullable(),
    })
    .optional(),
  inflation: z.object({
    status: z.literal('pending_integration'),
    value: z.null(),
    reference_period: z.null(),
    source: z.literal('INDEC'),
    published_at: z.null(),
    retrieved_at: z.null(),
  }),
});
const expenseBreakdownCategorySchema = z.object({
  category_id: z.number().int().positive(),
  category_name: z.string(),
  recurring_concept_name: z.string().nullable(),
  amount: exactAmount,
  movement_count: count,
});
export const statisticsExpenseBreakdownSchema = z.object({
  period: statisticsPeriodSchema,
  recurring: z.object({
    subtotal: exactAmount,
    movement_count: count,
    categories: z.array(expenseBreakdownCategorySchema),
  }),
  additional: z.object({
    subtotal: exactAmount,
    movement_count: count,
    categories: z.array(expenseBreakdownCategorySchema),
  }),
  total: exactAmount,
  movement_count: count,
});
export type StatisticsPeriod = z.infer<typeof statisticsPeriodSchema>;
export type StatisticMetric = z.infer<typeof metricSchema>;
export type StatisticsSummary = z.infer<typeof statisticsSummarySchema>;
export type StatisticsExpenseBreakdown = z.infer<typeof statisticsExpenseBreakdownSchema>;

// Group the exact decimal string without converting money to a JS number.
export function statisticsMoney(value: string) {
  const [whole, cents] = exactAmount.parse(value).split('.');
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
}
