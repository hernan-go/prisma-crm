import { calculateSummary, type BalanceRow } from './engine.js';
import { statisticsAnnualSchema, type StatisticsPeriod } from '../../shared/statistics.js';

export interface AnnualInput {
  periods: StatisticsPeriod[];
  members: (BalanceRow & { period_id: number })[];
  enrollments: { period_id: number; person_id: number }[];
}
const monthKey = (period: StatisticsPeriod) => period.year * 12 + period.month - 1;

// No money aggregation here: reuse exactly the monthly financial engine.
// IDs stay internal; the public response only contains counts and amounts.
export function calculateAnnual(year: number, input: AnnualInput, asOf: string) {
  const periods = input.periods.filter((p) => p.year <= year);
  const byId = new Map(periods.map((p) => [p.id, p]));
  const byMonth = new Map(periods.map((p) => [monthKey(p), p]));
  const people = new Map<number, Set<number>>();
  const first = new Map<number, number>();
  for (const enrollment of input.enrollments) {
    const period = byId.get(enrollment.period_id);
    if (!period) continue;
    const set = people.get(period.id) ?? new Set<number>();
    set.add(enrollment.person_id);
    people.set(period.id, set);
    const key = monthKey(period);
    first.set(enrollment.person_id, Math.min(first.get(enrollment.person_id) ?? key, key));
  }
  const members = new Map<number, BalanceRow[]>();
  for (const row of input.members) {
    const rows = members.get(row.period_id) ?? [];
    rows.push(row);
    members.set(row.period_id, rows);
  }
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = year * 12 + index;
    const period = byMonth.get(key) ?? null;
    if (!period)
      return {
        month,
        period,
        due: null,
        collected: null,
        participants: null,
        has_records: false,
        continuity: null,
        continuity_reason: 'missing_period' as const,
        entries: null,
      };
    const current = people.get(period.id) ?? new Set<number>();
    const previousPeriod = byMonth.get(key - 1);
    const previous = people.get(previousPeriod?.id ?? 0) ?? new Set<number>();
    const summary = calculateSummary(
      { period, members: members.get(period.id) ?? [], fees: [], expenses: [] },
      asOf,
    );
    let continued = 0;
    let fresh = 0;
    let rejoined = 0;
    let unclassified = 0;
    for (const person of current) {
      if (previous.has(person)) continued++;
      if (first.get(person) === key) fresh++;
      else if (!previousPeriod) unclassified++;
      else if (!previous.has(person)) rejoined++;
    }
    return {
      month,
      period,
      due: summary.metrics.due,
      collected: summary.metrics.collected,
      participants: current.size,
      has_records: current.size > 0 || summary.metrics.due.universe > 0,
      continuity:
        previousPeriod && previous.size
          ? { base: previous.size, continued, not_continued: previous.size - continued }
          : null,
      continuity_reason: !previousPeriod
        ? ('missing_previous' as const)
        : !previous.size
          ? ('empty_previous' as const)
          : null,
      entries: { new: fresh, rejoined, unclassified },
    };
  });
  const firstPeriod = [...periods].sort((a, b) => monthKey(a) - monthKey(b))[0];
  return statisticsAnnualSchema.parse({
    version: 1,
    year,
    as_of: asOf,
    time_axis: 'economic_period',
    history_start: firstPeriod
      ? `${firstPeriod.year}-${String(firstPeriod.month).padStart(2, '0')}`
      : null,
    warnings: [
      'Lectura actual de cada período económico; no es una fotografía contable congelada al cierre. Los períodos abiertos son provisionales.',
      'Personas nuevas significa primera inscripción en el historial disponible, que puede ser incompleto. Sin período anterior no se clasifican reincorporaciones ni continuidad.',
      'Inscripciones a actividades regulares, sin Eventos Especiales; no representan asistencia. No figurar al mes siguiente no equivale a una baja formal.',
    ],
    months,
  });
}
