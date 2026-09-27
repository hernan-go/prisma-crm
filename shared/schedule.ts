import { days } from './domain.js';
export type Slot = { day: number; start: string; end: string };
export type Booking = Slot & {
  id?: number;
  person_id: number;
  activity_id: number;
  instructor_ids: number[];
  schedule_id: number;
  activity: string;
  mode: string;
};
export const overlaps = (a: Slot, b: Slot) => a.day === b.day && a.start < b.end && a.end > b.start;
export function scheduleConflict(next: Booking, existing: Booking[]) {
  for (const old of existing) {
    if (!overlaps(next, old)) continue;
    const label = `${old.activity} · ${days[old.day]} ${old.start}–${old.end}.`;
    if (next.person_id === old.person_id) return `Este horario se superpone con ${label}`;
    if (next.schedule_id === old.schedule_id) {
      if (next.mode === 'individual' || old.mode === 'individual')
        return `La actividad individual ya está reservada: ${label}`;
      continue;
    }
    if (next.instructor_ids.some((id) => old.instructor_ids.includes(id)))
      return `Un facilitador ya está asignado a ${label}`;
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
