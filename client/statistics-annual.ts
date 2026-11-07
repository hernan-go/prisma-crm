import { api } from './api';
import { statisticsAnnualSchema, type StatisticsAnnual } from '../shared/statistics';

export const statisticsAnnualKey = (year: number) => ['statistics-annual', year] as const;
export const annualQueryOptions = (year: number) => ({
  queryKey: statisticsAnnualKey(year),
  staleTime: 20_000,
  queryFn: async () => statisticsAnnualSchema.parse(await api('/statistics/annual?year=' + year)),
});

// Numbers serve geometry only; exact financial strings remain in tooltips/table.
export function annualChartRows(data: StatisticsAnnual) {
  return data.months.map((month) => ({
    ...month,
    label: new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(
      new Date(data.year, month.month - 1, 15),
    ),
    duePlot: month.due && month.due.coverage !== 'undefined' ? Number(month.due.value) : null,
    collectedPlot: month.collected ? Number(month.collected.value) : null,
    continued: month.continuity?.continued ?? null,
    notContinued: month.continuity?.not_continued ?? null,
    fresh: month.entries?.new ?? null,
    rejoined: month.entries && month.entries.unclassified === 0 ? month.entries.rejoined : null,
  }));
}
