import { Decimal } from 'decimal.js';
import {
  statisticsSummarySchema,
  type StatisticsPeriod,
  type StatisticMetric,
} from '../../shared/statistics.js';

// Local precision: do not alter the financial modules' global Decimal settings.
const Money = Decimal.clone({ precision: 40 });
export interface BalanceRow {
  account_id: number | null;
  amount_due: string | null;
  paid: string;
  payment_count: number;
}
export interface SummaryInput {
  period: StatisticsPeriod;
  members: BalanceRow[];
  fees: BalanceRow[];
  expenses: { amount: string }[];
}
export function calculateSummary(input: SummaryInput, asOf: string) {
  const metric = (
    values: string[],
    universe: number,
    undefinedCount: number,
    missing: number,
    source: string[],
  ): StatisticMetric => {
    const defined = universe - undefinedCount - missing;
    return {
      value: values.reduce((sum, v) => sum.plus(v), new Money(0)).toFixed(2),
      coverage:
        universe === 0
          ? 'empty'
          : defined === 0
            ? 'undefined'
            : defined < universe
              ? 'partial'
              : 'complete',
      universe,
      defined,
      undefined: undefinedCount,
      missing,
      period_id: input.period.id,
      time_axis: 'economic_period',
      source,
      warnings:
        undefinedCount + missing > 0 ? ['Subtotal conocido: hay importes sin definir.'] : [],
    };
  };
  const balances = (rows: BalanceRow[], source: string[]) => {
    const known = rows.filter((r) => r.account_id !== null && r.amount_due !== null);
    const missing = rows.filter((r) => r.account_id === null).length;
    const undefinedCount = rows.filter(
      (r) => r.account_id !== null && r.amount_due === null,
    ).length;
    const withCoverage = (values: string[]) =>
      metric(values, rows.length, undefinedCount, missing, source);
    return {
      due: withCoverage(known.map((r) => r.amount_due!)),
      pending: withCoverage(
        known.map((r) => Money.max(new Money(r.amount_due!).minus(r.paid), 0).toFixed(2)),
      ),
      excess: withCoverage(
        known.map((r) => Money.max(new Money(r.paid).minus(r.amount_due!), 0).toFixed(2)),
      ),
      paid: metric(
        rows.map((r) => r.paid),
        rows.reduce((n, r) => n + r.payment_count, 0),
        0,
        0,
        source,
      ),
      overpaid: known.filter((r) => new Money(r.paid).gt(r.amount_due!)).length,
    };
  };
  const members = balances(input.members, ['period_memberships', 'monthly_accounts', 'payments']);
  const fees = balances(input.fees, [
    'period_activities',
    'activity_schedules',
    'schedule_instructors',
    'facilitator_accounts',
    'facilitator_payments',
  ]);
  if (fees.overpaid)
    fees.pending.warnings.push(
      'Hay pagos superiores al compromiso actual; no constituyen un crédito de facilitador.',
    );
  return statisticsSummarySchema.parse({
    version: 1,
    period: input.period,
    as_of: asOf,
    empty: input.members.length === 0 && input.fees.length === 0 && input.expenses.length === 0,
    metrics: {
      due: members.due,
      collected: members.paid,
      debt: members.pending,
      credit: members.excess,
      fees_committed: fees.due,
      fees_paid: fees.paid,
      fees_pending: fees.pending,
      expenses: metric(
        input.expenses.map((r) => r.amount),
        input.expenses.length,
        0,
        0,
        ['period_expense_categories', 'period_expenses'],
      ),
    },
    fees_overpaid: { count: fees.overpaid, excess: fees.excess.value },
    inflation: {
      status: 'pending_integration',
      value: null,
      reference_period: null,
      source: 'INDEC',
      published_at: null,
      retrieved_at: null,
    },
  });
}
