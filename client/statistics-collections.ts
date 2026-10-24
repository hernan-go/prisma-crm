import { queryOptions } from '@tanstack/react-query';
import { api } from './api';
import { statisticsSummarySchema, type StatisticsSummary } from '../shared/statistics';

export const statisticsKey = (period: number) => ['statistics-summary', period] as const;
export const statisticsSummaryQueryOptions = (period: number) =>
  queryOptions({
    queryKey: statisticsKey(period),
    queryFn: async () => {
      const result = statisticsSummarySchema.parse(
        await api(`/statistics/summary?period_id=${period}`),
      );
      if (result.period.id !== period)
        throw new Error('La respuesta no corresponde al período seleccionado.');
      return result;
    },
  });

// Verify supplied magnitudes; the backend remains the source of all money/percentage calculations.
export function collectionsReconcile(data: StatisticsSummary) {
  const c = data.collections;
  if (!c) return false;
  const cents = (v: string) => BigInt(v.replace('.', ''));
  const m = data.metrics;
  if (
    [m.due, m.debt, m.credit, m.collected].some(
      (v) => v.period_id !== data.period.id || v.time_axis !== 'economic_period',
    )
  )
    return false;
  const sameCoverage = (v: typeof m.due) =>
    (['universe', 'defined', 'undefined', 'missing', 'coverage'] as const).every(
      (k) => v[k] === m.due[k],
    );
  const due = cents(m.due.value);
  // Check backend percentage with exact integer rounding to two decimal places.
  const percentageMatches =
    due > 0n
      ? c.covered_percentage !== null &&
        cents(c.covered_percentage) === (cents(c.applied_known) * 20000n + due) / (2n * due)
      : c.covered_percentage === null;
  return (
    sameCoverage(m.debt) &&
    sameCoverage(m.credit) &&
    m.due.defined + m.due.undefined + m.due.missing === m.due.universe &&
    cents(c.applied_known) + cents(m.debt.value) === cents(m.due.value) &&
    cents(c.applied_known) + cents(m.credit.value) + cents(c.collected_undefined) ===
      cents(m.collected.value) &&
    percentageMatches
  );
}
