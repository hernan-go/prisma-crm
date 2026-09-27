import { it, expect } from 'vitest';
import { nextPeriod, scheduleConflict, type Booking } from '../shared/schedule.js';
const b: Booking = {
  person_id: 1,
  activity_id: 1,
  instructor_ids: [1],
  schedule_id: 1,
  activity: 'Yoga',
  mode: 'group',
  day: 1,
  start: '10:00',
  end: '11:00',
};
it('detecta conflicto personal aunque cambie el docente', () =>
  expect(
    scheduleConflict({ ...b, activity_id: 2, instructor_ids: [2], schedule_id: 2 }, [b]),
  ).toContain('se superpone'));
it('permite horarios consecutivos', () =>
  expect(scheduleConflict({ ...b, start: '11:00', end: '12:00' }, [b])).toBe(''));
it('impide dos actividades del mismo docente', () =>
  expect(scheduleConflict({ ...b, person_id: 2, activity_id: 2, schedule_id: 2 }, [b])).toContain(
    'facilitador',
  ));
it('permite asistentes grupales con idéntico horario', () =>
  expect(scheduleConflict({ ...b, person_id: 2 }, [b])).toBe(''));
it('bloquea reservas individuales y superposición parcial grupal', () => {
  expect(scheduleConflict({ ...b, person_id: 2, mode: 'individual' }, [b])).toContain('individual');
  expect(scheduleConflict({ ...b, person_id: 2, schedule_id: 2, end: '12:00' }, [b])).toContain(
    'facilitador',
  );
});
it('sugiere próximo período libre y cambia de año', () => {
  expect(nextPeriod([], new Date(2026, 8, 26))).toEqual({ year: 2026, month: 10 });
  expect(
    nextPeriod(
      [
        { year: 2026, month: 10 },
        { year: 2026, month: 11 },
        { year: 2026, month: 12 },
      ],
      new Date(2026, 8, 26),
    ),
  ).toEqual({ year: 2027, month: 1 });
});
