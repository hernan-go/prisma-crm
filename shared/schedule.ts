import { days } from './domain.js';
export type Slot = { day: number; start: string; end: string };
export type Booking = Slot & {
  id?: number;
  person_id: number;
  activity_id: number;
  instructor_id: number;
  activity: string;
  mode: string;
};
export const overlaps = (a: Slot, b: Slot) => a.day === b.day && a.start < b.end && a.end > b.start;
export function scheduleConflict(next: Booking, existing: Booking[]) {
  for (const old of existing) {
    if (!overlaps(next, old)) continue;
    const label = `${old.activity} · ${days[old.day]} ${old.start}–${old.end}.`;
    if (next.person_id === old.person_id) return `Este horario se superpone con ${label}`;
    if (next.instructor_id === old.instructor_id) {
      if (next.activity_id !== old.activity_id) return `El docente ya dicta ${label}`;
      if (next.mode === 'individual' || old.mode === 'individual')
        return `La actividad individual ya está reservada: ${label}`;
      if (next.start !== old.start || next.end !== old.end)
        return `El taller grupal debe compartir el horario completo: ${label}`;
    }
  }
  return '';
}
export function nextPeriod(existing: { year: number; month: number }[], now = new Date()) {
  let year = now.getFullYear(),
    month = now.getMonth() + 2;
  if (month === 13) {
    year++;
    month = 1;
  }
  while (existing.some((p) => p.year === year && p.month === month)) {
    month++;
    if (month === 13) {
      year++;
      month = 1;
    }
  }
  return { year, month };
}
