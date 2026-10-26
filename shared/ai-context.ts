import { z } from 'zod';
import { metricSchema, statisticsPeriodSchema, exactAmount } from './statistics.js';

export const monthlyContextQuerySchema = z
  .object({ period: z.string().regex(/^(20[2-9]\d|2100)-(0[1-9]|1[0-2])$/) })
  .strict();
const count = z.number().int().nonnegative();
const block = <T extends z.ZodType>(data: T) => z.object({ status: z.literal('available'), data });
const activity = z.object({
  activity_id: z.number().int().positive(),
  name: z.string().max(180),
  enrollments: count,
  weekly_slots: count,
});
export const monthlyContextSchema = z.object({
  version: z.literal('2.0'),
  period: statisticsPeriodSchema,
  as_of: z.iso.datetime(),
  time_axis: z.literal('economic_period'),
  units: z.object({
    money: z.literal('ARS'),
    people: z.literal('unique_people'),
    slots: z.literal('weekly_slots'),
  }),
  privacy: z.object({
    policy: z.literal('authorized_business_read_v2'),
    participant_identifiers: z.literal('excluded'),
    personal_free_text: z.literal('excluded'),
  }),
  people: block(z.object({ members: count, enrolled: count, without_enrollment: count })),
  contracting: block(
    z.object({
      enrollments: count,
      weekly_slots: count,
      activities: z.array(activity).max(500),
      highest_activity_ids: z.array(z.number().int().positive()),
      lowest_activity_ids: z.array(z.number().int().positive()),
    }),
  ),
  offered_schedules: z
    .array(
      z.object({
        schedule_id: z.number().int().positive(),
        activity_id: z.number().int().positive(),
        activity: z.string().max(180),
        mode: z.enum(['group', 'individual']),
        day: z.number().int().min(0).max(6),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(2000),
  combinations: block(
    z
      .array(
        z.object({
          activity_ids: z.array(z.number().int().positive()).max(500),
          people: count,
          enrollments: count,
          weekly_slots: count,
        }),
      )
      .max(2000),
  ),
  continuity: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('available'),
      data: z.object({
        previous_period: statisticsPeriodSchema,
        previously_enrolled: count,
        currently_enrolled: count,
        retained: count,
        new_in_pair: count,
        without_current_enrollment: count,
      }),
    }),
    z.object({
      status: z.literal('unavailable'),
      data: z.null(),
      reason: z.literal('previous_calendar_period_missing'),
    }),
  ]),
  collections: block(
    z.object({
      due: metricSchema,
      collected: metricSchema,
      debt: metricSchema,
      credit: metricSchema,
      applied_known: exactAmount,
      collected_undefined: exactAmount,
      covered_percentage: z.string().nullable(),
    }),
  ),
  fees: block(
    z.object({
      committed: metricSchema,
      paid: metricSchema,
      pending: metricSchema,
      overpaid_count: count,
      overpaid_excess: exactAmount,
      agreements: z
        .array(
          z.object({
            agreement_id: z.number().int().positive().nullable(),
            offering_id: z.number().int().positive(),
            activity_id: z.number().int().positive(),
            activity: z.string().max(180),
            professional_id: z.number().int().positive(),
            professional: z.string().max(201),
            amount_due: exactAmount.nullable(),
            paid: exactAmount,
            pending: exactAmount.nullable(),
            excess: exactAmount.nullable(),
            payment_count: count,
          }),
        )
        .max(2000),
    }),
  ),
  expenses: block(
    z.object({
      registered: metricSchema,
      categories: z
        .array(
          z.object({
            category_id: z.number().int().positive(),
            category_name: z.string().max(200),
            recurring_concept: z.string().max(200).nullable(),
            controlled_concept: z.string().max(200),
            kind: z.enum(['recurring', 'additional']),
            amount: exactAmount,
            movement_count: count,
          }),
        )
        .max(500),
      breakdown_status: z.literal('available'),
      concept_detail: z.literal('catalogue_or_category_only'),
    }),
  ),
  coverage: z.object({
    basis: z.literal('retained_records'),
    operational_completeness: z.literal('unknown'),
    expense_completeness: z.literal('unknown'),
  }),
  sources: z.array(z.string()),
  unavailable: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type MonthlyContext = z.infer<typeof monthlyContextSchema>;
