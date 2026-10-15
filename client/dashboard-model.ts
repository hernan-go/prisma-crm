export const DASHBOARD_TIME_ZONE = 'America/Argentina/Cordoba';
const weekdays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function dashboardDate(now: Date) {
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: DASHBOARD_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: weekdays.indexOf(part('weekday')),
    weekday: part('weekday'),
    date: new Intl.DateTimeFormat('es-AR', {
      timeZone: DASHBOARD_TIME_ZONE,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now),
    time: new Intl.DateTimeFormat('es-AR', {
      timeZone: DASHBOARD_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  };
}
export function programmingTitle(period: { year: number; month: number }, now: Date) {
  const current = dashboardDate(now);
  return period.year === current.year && period.month === current.month
    ? 'Actividades de hoy'
    : `Programación de los ${current.weekday === 'sábado' || current.weekday === 'domingo' ? `${current.weekday}s` : current.weekday}`;
}
export interface AgendaSchedule {
  id: number;
  period_id: number;
  activity: string;
  active: number;
  offered: number;
  catalog_active: number;
  day: number;
  start: string;
  end: string;
  instructors: { id: number; name: string }[];
  people: { person_id: number; nombre: string; apellido: string }[];
}
export function dailySchedules(rows: AgendaSchedule[], period: number, day: number) {
  return rows
    .filter(
      (s) =>
        s.period_id === period &&
        s.day === day &&
        s.active === 1 &&
        s.offered === 1 &&
        s.catalog_active === 1,
    )
    .map((s) => ({
      ...s,
      instructors: [...new Map(s.instructors.map((i) => [i.id, i])).values()],
      people: [...new Map(s.people.map((p) => [p.person_id, p])).values()].sort(
        (a, b) =>
          a.apellido.localeCompare(b.apellido, 'es') ||
          a.nombre.localeCompare(b.nombre, 'es') ||
          a.person_id - b.person_id,
      ),
    }))
    .sort(
      (a, b) =>
        a.start.localeCompare(b.start) || a.activity.localeCompare(b.activity, 'es') || a.id - b.id,
    );
}
