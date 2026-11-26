import { z } from 'zod';
import type { Request } from 'express';
import { query, execute, type Connection } from './db.js';
import { AppError } from './errors.js';
import { authorizeReceipt, receiptSchema } from './receipt-authority.js';
import { previousReceiptOperation, recordReceiptOperation } from './payment-receipts.js';

export interface ReceiptFinancialContext {
  token: string;
  operationId?: string;
  reason?: string;
}
export function receiptRequestContext(req: Request): ReceiptFinancialContext {
  const name = process.env.NODE_ENV === 'production' ? '__Host-prisma_identity' : 'prisma_identity';
  const cookies = (req.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .filter((x) => x.startsWith(name + '='));
  return {
    token: cookies.length === 1 ? cookies[0].slice(name.length + 1) : '',
    operationId: req.get('Idempotency-Key'),
    reason: req.get('X-Correction-Reason'),
  };
}
type Change = {
  kind: 'payment-update' | 'payment-delete' | 'membership-delete';
  id: number;
  input: unknown;
};
export async function receiptFinancialChange<T>(
  db: Connection,
  change: Change,
  context: ReceiptFinancialContext | undefined,
  mutate: () => Promise<T>,
): Promise<T> {
  if (!(await receiptSchema(db, false))) return mutate();
  const matches = await query<{ number: string; status: string }>(
    `SELECT CAST(number AS CHAR) number,status FROM payment_receipts WHERE ${change.kind === 'membership-delete' ? 'account_id IN (SELECT a.id FROM monthly_accounts a JOIN period_memberships m ON m.person_id=a.person_id AND m.period_id=a.period_id WHERE m.id=?)' : 'payment_id=?'} FOR UPDATE`,
    [change.id],
    db,
  );
  const [prior] = context?.operationId
    ? await query<{ operation_id: string }>(
        'SELECT operation_id FROM payment_receipt_operations WHERE operation_id=?',
        [context.operationId],
        db,
      )
    : [];
  if (!matches.length && !prior) return mutate();
  const actor = await authorizeReceipt(db, context?.token ?? '');
  const operationId = z.string().uuid().parse(context?.operationId);
  const reason = z.string().trim().min(1).max(2000).parse(context?.reason);
  const request = { ...change, reason };
  const previous = await previousReceiptOperation<T>(db, operationId, actor, request);
  if (previous !== undefined) return previous;
  if (matches.some((r) => r.status === 'active'))
    throw new AppError(409, 'Anulá el recibo vigente antes de corregir o borrar el movimiento.', {
      receiptNumbers: matches.map((r) => r.number),
    });
  const before =
    change.kind === 'membership-delete'
      ? await query(
          'SELECT a.id,a.person_id,a.period_id,a.amount_due FROM monthly_accounts a JOIN period_memberships m ON m.person_id=a.person_id AND m.period_id=a.period_id WHERE m.id=? FOR UPDATE',
          [change.id],
          db,
        )
      : await query(
          'SELECT p.id,p.account_id,p.date,p.amount,p.method,p.recipient,m.person_id,m.period_id FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE p.id=? FOR UPDATE',
          [change.id],
          db,
        );
  if (change.kind !== 'payment-update')
    for (const row of matches)
      await execute(
        `UPDATE payment_receipts SET ${change.kind === 'membership-delete' ? 'account_id' : 'payment_id'}=NULL WHERE number=?`,
        [row.number],
        db,
      );
  const result = await mutate();
  await recordReceiptOperation(db, operationId, actor, request, result, {
    kind: change.kind,
    originalId: change.id,
    receiptNumbers: matches.map((r) => r.number),
    before,
  });
  return result;
}
