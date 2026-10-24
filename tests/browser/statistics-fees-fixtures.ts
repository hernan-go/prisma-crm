import { Decimal } from 'decimal.js';
import { facilitatorPending, type FacilitatorAccount } from '../../shared/facilitators';
import type { BalanceRow } from '../../server/statistics/engine';

// One synthetic source for accounts, payment aggregates and summary coverage.
// Aggregates belong to the account's economic period, independently of payment dates.
export function feesFixture(period: number, scenario: string | null) {
  type Source = { id: number | null; due: string | null; payments: string[] };
  let source: Source[] = Array.from(
    { length: scenario === 'many' ? 24 : period === 2 ? 5 : 6 },
    (_, i) => ({
      id: i + 1,
      due: '100000.00',
      payments: i % 3 === 0 ? [] : [i % 3 === 1 ? '50000.00' : '100000.00'],
    }),
  );
  if (scenario === 'empty') source = [];
  if (
    [
      'single',
      'unpaid',
      'half',
      'full',
      'unknown',
      'zero',
      'overpaid',
      'multiple-payments',
    ].includes(scenario ?? '')
  ) {
    source = [
      {
        id: 1,
        due: scenario === 'unknown' ? null : scenario === 'zero' ? '0.00' : '100000.00',
        payments:
          scenario === 'unpaid' || scenario === 'zero'
            ? []
            : scenario === 'full'
              ? ['100000.00']
              : scenario === 'overpaid'
                ? ['120000.00']
                : scenario === 'unknown'
                  ? ['20000.00']
                  : scenario === 'multiple-payments'
                    ? ['10000.01', '20000.02', '19999.97']
                    : ['50000.00'],
      },
    ];
  }
  if (scenario === 'partial' || scenario === 'incomplete')
    source = [
      { id: 1, due: '100000.00', payments: ['50000.00'] },
      { id: 2, due: null, payments: ['20000.00'] },
      { id: null, due: null, payments: [] },
    ];
  const Money = Decimal.clone({ precision: 40 });
  const paid = (s: Source) => s.payments.reduce((n, p) => n.plus(p), new Money(0)).toFixed(2);
  const accounts: FacilitatorAccount[] = source.map((s, i) => ({
    id: s.id,
    offering_id: i + 1,
    instructor_id: i + 1,
    instructor: `${period === 2 ? 'Facilitador septiembre' : 'Facilitador'} ${i + 1}${scenario === 'many' ? ' · nombre de prueba para comprobar legibilidad' : ''}`,
    activity: 'Actividad de prueba',
    amount_due: s.due,
    paid: paid(s),
    pending: facilitatorPending(s.due, paid(s)),
    notes: '',
    assigned: 1,
  }));
  const balances: BalanceRow[] = source.map((s) => ({
    account_id: s.id,
    amount_due: s.due,
    paid: paid(s),
    payment_count: s.payments.length,
  }));
  return { accounts, balances };
}
