import { z } from 'zod';
import type { Expense } from './expenses.js';
import { expenseSchema } from './expenses.js';
import { money } from './domain.js';

export const recurringIcons = [
  'house',
  'building-2',
  'zap',
  'flame',
  'wifi',
  'droplets',
  'landmark',
  'heart-pulse',
  'receipt',
] as const;
export const recurringConceptSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    icon_name: z.enum(recurringIcons),
    active: z.boolean(),
    sort_order: z.number().int().min(0).max(65535),
  })
  .strict();
export const recurringConceptSaveSchema = recurringConceptSchema
  .omit({ sort_order: true })
  .extend({ sort_order: z.number().int().min(0).max(65535).optional() })
  .strict();
export type RecurringConcept = z.infer<typeof recurringConceptSchema> & { id: number };
export type RecurringTile = RecurringConcept & {
  position: number;
  revision: string;
  category_id: number | null;
  category_name: string | null;
  expenses: Expense[];
  status: 'missing' | 'single' | 'review';
  amount: string | null;
};
// Existing historical text must survive an amount-only correction byte for byte.
const recurringExpenseSchema = expenseSchema.extend({
  concept: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => value.trim().length > 0),
  notes: z.string().max(2000).default(''),
});
export const recurringRevisionSchema = z
  .string()
  .max(20)
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine(
    (v) => /^(0|[1-9][0-9]*)$/.test(v) && v.length <= 20 && BigInt(v) <= 18446744073709551615n,
  );
export const recurringExpectedSchema = recurringExpenseSchema.extend({
  id: z.number().int().positive(),
  amount: money,
  notes: z.string().max(2000),
});
export const recurringPresenceSchema = z.object({ revision: recurringRevisionSchema }).strict();
export const recurringPositionSchema = recurringPresenceSchema
  .extend({ position: z.number().int().min(1).max(4294967295) })
  .strict();
export const recurringRemovalSchema = recurringPresenceSchema
  .extend({ expected: recurringExpectedSchema.nullable() })
  .strict();
export type RecurringSnapshot = { revision: string; tiles: RecurringTile[] };
export const recurringSaveSchema = z
  .object({
    revision: recurringRevisionSchema,
    expense: recurringExpenseSchema,
    expected: recurringExpectedSchema.nullable(),
  })
  .strict();
export const recurringLinkSchema = z
  .object({ revision: recurringRevisionSchema, category_id: z.number().int().positive() })
  .strict();
export const recurringAmountRemovalSchema = z
  .object({ revision: recurringRevisionSchema, expected: recurringExpectedSchema })
  .strict();

// Opt-in installation preset. Never used by migrations, reads or period creation.
export const prismaRecurringPreset = [
  ['Alquiler', 'house'],
  ['Expensas', 'building-2'],
  ['Luz', 'zap'],
  ['Gas', 'flame'],
  ['Internet', 'wifi'],
  ['Agua', 'droplets'],
  ['Impuestos', 'landmark'],
  ['Cobertura médica', 'heart-pulse'],
].map(([name, icon_name], index) => ({
  name,
  icon_name: icon_name as RecurringConcept['icon_name'],
  active: true,
  sort_order: (index + 1) * 10,
}));
