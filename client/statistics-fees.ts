import type { FacilitatorAccount } from '../shared/facilitators';
import type { StatisticsSummary } from '../shared/statistics';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api';

const cents = (value: string) => BigInt(value.replace('.', ''));

export const facilitatorQueryOptions = (period: number) =>
  queryOptions({
    queryKey: ['facilitator-accounts', period],
    queryFn: () => api<FacilitatorAccount[]>('/facilitator-accounts?period_id=' + period),
  });

// Compare account-level subtotals, before grouping people. Paid includes unknown dues;
// pending is supplied by the financial API and must never be netted across accounts.
export function reconcileFacilitatorAccounts(
  accounts: FacilitatorAccount[],
  summary: StatisticsSummary,
) {
  const known = accounts.filter((a) => a.id !== null && a.amount_due !== null);
  const missing = accounts.filter((a) => a.id === null).length;
  const undefinedCount = accounts.filter((a) => a.id !== null && a.amount_due === null).length;
  const coverage = !accounts.length
    ? 'empty'
    : !known.length
      ? 'undefined'
      : known.length < accounts.length
        ? 'partial'
        : 'complete';
  const sum = (values: string[]) => values.reduce((n, v) => n + cents(v), 0n);
  const differences: string[] = [];
  const metrics = summary.metrics;
  for (const metric of [metrics.fees_committed, metrics.fees_pending, metrics.fees_paid]) {
    if (metric.period_id !== summary.period.id || metric.time_axis !== 'economic_period')
      return ['Período de referencia de honorarios'];
  }
  if (sum(known.map((a) => a.amount_due!)) !== cents(metrics.fees_committed.value))
    differences.push('A pagar conocido');
  if (sum(accounts.map((a) => a.paid)) !== cents(metrics.fees_paid.value))
    differences.push('Pagado');
  // A NULL pending on a defined account is not a zero and cannot be compared.
  if (known.some((a) => a.pending === null)) differences.push('Pendiente no comparable');
  else if (sum(known.map((a) => a.pending!)) !== cents(metrics.fees_pending.value))
    differences.push('Pendiente conocido');
  if (
    [metrics.fees_committed, metrics.fees_pending].some(
      (m) =>
        m.universe !== accounts.length ||
        m.defined !== known.length ||
        m.missing !== missing ||
        m.undefined !== undefinedCount ||
        m.coverage !== coverage,
    )
  )
    differences.push('Cobertura de honorarios');
  const overpaid = known.filter((a) => cents(a.paid) > cents(a.amount_due!));
  const excess = overpaid.reduce((n, a) => n + cents(a.paid) - cents(a.amount_due!), 0n);
  if (
    summary.fees_overpaid.count !== overpaid.length ||
    cents(summary.fees_overpaid.excess) !== excess
  )
    differences.push('Sobrepagos');
  return differences;
}

export function facilitatorChartRows(accounts: FacilitatorAccount[]) {
  const groups = new Map<number, FacilitatorAccount[]>();
  for (const a of accounts)
    groups.set(a.instructor_id, [...(groups.get(a.instructor_id) ?? []), a]);
  const sum = (values: string[]) => {
    const cents = values.reduce((n, v) => n + BigInt(v.replace('.', '')), 0n);
    return cents / 100n + '.' + (cents % 100n).toString().padStart(2, '0');
  };
  return [...groups].map(([id, rows]) => {
    const due = rows.some((r) => r.amount_due === null)
      ? null
      : sum(rows.map((r) => r.amount_due!));
    const paid = sum(rows.map((r) => r.paid));
    const known =
      due !== null &&
      BigInt(due.replace('.', '')) > 0n &&
      !rows.some(
        (r) =>
          r.amount_due !== null &&
          BigInt(r.paid.replace('.', '')) > BigInt(r.amount_due.replace('.', '')),
      );
    return {
      id,
      name: rows[0].instructor,
      due,
      paid,
      fraction: known ? Number(paid) / Number(due) : 0,
      warning: !known ? 'Sin proporción: importe indefinido, base cero o sobrepago.' : null,
    };
  });
}
