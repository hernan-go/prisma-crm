import { Decimal } from 'decimal.js';
import type { BalanceRow } from '../../server/statistics/engine';

export function collectionsFixture(scenario: string | null, period = 1): BalanceRow[] {
  const row = (id: number | null, due: string | null, payments: string[]): BalanceRow => ({
    account_id: id,
    amount_due: due,
    paid: payments.reduce((n, v) => n.plus(v), new Decimal(0)).toFixed(2),
    payment_count: payments.length,
  });
  if (scenario === 'empty' || (scenario === 'slow' && period === 2)) return [];
  if (scenario === 'full') return [row(1, '100.00', ['100.00'])];
  if (scenario === 'unpaid') return [row(1, '100.00', [])];
  if (scenario === 'zero') return [row(1, '0.00', [])];
  if (scenario === 'zero-credit') return [row(1, '0.00', ['20.00'])];
  if (scenario === 'unknown') return [row(1, null, [])];
  if (scenario === 'unknown-paid') return [row(1, null, ['20.00'])];
  if (scenario === 'missing') return [row(null, null, [])];
  if (scenario === 'overpaid') return [row(1, '100.00', ['150.00'])];
  if (scenario === 'debt-credit') return [row(1, '100.00', ['150.00']), row(2, '100.00', [])];
  if (scenario === 'multiple') return [row(1, '100.00', ['10.01', '20.02', '19.97'])];
  if (scenario === 'partial') return [row(1, '100.00', ['50.00'])];
  if (scenario === 'rounding') return [row(1, '3.00', ['1.00'])];
  return [
    row(1, '100.10', ['40.05']),
    row(2, '30.00', ['50.00']),
    row(3, null, ['10.00']),
    row(null, null, []),
  ];
}
