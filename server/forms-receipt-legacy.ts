import { createHash } from 'node:crypto';
import { z } from 'zod';
import { money, paymentSchema, personSchema } from '../shared/domain.js';
import { formSelectionSchema } from '../shared/forms.js';

// Receipt recognition only. Never use this schema to authorize new writes.
// Preserve the pre-009 payment property order and defaults for existing SHA-256 hashes.
const legacyPaymentSchema = z
  .object({
    amount: z.string(),
    method: z.string(),
    date: z.string(),
    include: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (
      p.include &&
      (!money.safeParse(p.amount).success ||
        !paymentSchema.omit({ recipient: true }).safeParse({ ...p, person_id: 1, period_id: 1 })
          .success)
    )
      ctx.addIssue({ code: 'custom', message: 'Pago histórico inválido.' });
  });
const legacyRowSchema = z
  .object({
    person: z.unknown(),
    action: z.enum(['create', 'update', 'keep', 'skip']),
    target_id: z.number().int().positive().optional(),
    reviewed: z.boolean(),
    selections: z.array(formSelectionSchema).max(30),
    amount_due: z.union([z.literal(''), money]).default(''),
    payment: legacyPaymentSchema,
  })
  .superRefine((r, ctx) => {
    if (r.action === 'skip') return;
    if (
      !r.reviewed ||
      !personSchema.safeParse(r.person).success ||
      ((r.action === 'keep' || r.action === 'update') && !r.target_id)
    )
      ctx.addIssue({ code: 'custom', message: 'Respuesta histórica inválida.' });
  });

export function legacyReceiptHash(period: number, input: unknown[]): string | undefined {
  // Do not discard an explicitly supplied recipient to match an old receipt.
  if (
    input.some(
      (r: any) => r?.action !== 'skip' && r?.payment && Object.hasOwn(r.payment, 'recipient'),
    )
  )
    return undefined;
  const rows = [];
  for (const row of input) {
    if ((row as any)?.action === 'skip') {
      rows.push({ action: 'skip' });
      continue;
    }
    const parsed = legacyRowSchema.safeParse(row);
    if (!parsed.success) return undefined;
    rows.push(parsed.data);
  }
  return createHash('sha256').update(JSON.stringify({ period, rows })).digest('hex');
}
