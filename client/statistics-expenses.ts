import { queryOptions } from '@tanstack/react-query';
import { api } from './api';
import {
  statisticsExpenseBreakdownSchema,
  type StatisticsExpenseBreakdown,
} from '../shared/statistics';

export const statisticsExpenseKey = (period: number) => ['statistics-expenses', period] as const;

// Shared by the existing breakdown and the chart: one cache, one validated response.
export const expenseQueryOptions = (period: number) =>
  queryOptions({
    queryKey: statisticsExpenseKey(period),
    queryFn: async () => {
      const result = statisticsExpenseBreakdownSchema.parse(
        await api(`/statistics/expenses?period_id=${period}`),
      );
      if (result.period.id !== period)
        throw new Error('El desglose no corresponde al período seleccionado.');
      return result;
    },
  });

export function expenseChartRows(data: StatisticsExpenseBreakdown) {
  return [
    ...data.recurring.categories.map((row) => ({ ...row, kind: 'Recurrente' as const })),
    ...data.additional.categories.map((row) => ({ ...row, kind: 'Adicional' as const })),
  ]
    .map((row) => ({
      ...row,
      name: row.recurring_concept_name ?? row.category_name,
      // Number is used only for SVG geometry. Labels/table/tooltips keep the exact string.
      plotAmount: Number(row.amount),
    }))
    .sort((a, b) => {
      const left = BigInt(a.amount.replace('.', ''));
      const right = BigInt(b.amount.replace('.', ''));
      return left === right ? a.category_id - b.category_id : left > right ? -1 : 1;
    });
}
