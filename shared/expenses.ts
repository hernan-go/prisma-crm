import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { money } from './domain.js';

export const expenseCategorySchema = z
  .object({ name: z.string().trim().min(1, 'El nombre es obligatorio.').max(200) })
  .strict();

export const expenseSchema = z
  .object({
    concept: z.string().trim().min(1, 'El concepto es obligatorio.').max(200),
    date: z.iso.date(),
    amount: money.pipe(
      z.string().refine((value) => new Decimal(value).gt(0), 'El importe debe ser mayor a cero.'),
    ),
    notes: z.string().trim().max(2000).default(''),
  })
  .strict();

export function expenseSchemaForPeriod(month: string) {
  return expenseSchema.refine((expense) => expense.date.slice(0, 7) === month, {
    path: ['date'],
    message: 'La fecha del gasto debe pertenecer al período seleccionado.',
  });
}

export const associatedExpenseSchema = expenseSchema.extend({
  special_event_id: z.number().int().positive().nullable(),
  category_id: z.number().int().positive(),
  period_id: z.number().int().positive(),
  request_id: z.uuid(),
  expected_revision: z.number().int().positive(),
});
export type Expense = z.infer<typeof expenseSchema> & {
  id: number;
  category_id: number;
  special_event_id?: number | null;
  event_revision?: number;
};
export type ExpenseCategory = z.infer<typeof expenseCategorySchema> & {
  id: number;
  period_id: number;
  recurring_concept_id?: number | null;
  expenses: Expense[];
};
