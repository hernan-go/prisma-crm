import { it, expect } from 'vitest';
import { formsMapping, parseOption, parseFormPayment, formRowSchema } from '../shared/forms.js';
const activities = [
  { id: 1, name: 'Yoga Terapéutico Integral', instructor_id: 1, days: [1, 3] },
  { id: 2, name: 'Gimnasia y Fortalecimiento Corporal', instructor_id: 2, days: [5] },
];
it('reconoce encabezados reales Google Forms con puntuación y acentos', () => {
  const m = formsMapping([
    'Marca temporal',
    'Dirección de correo electrónico',
    'Nombre Completo.',
    'D.N.I',
    'Número de Teléfono (con código de área)',
    'Elegí la opción que corresponde. TURNO MAÑANA',
    'Pago',
  ]);
  expect(m).toMatchObject({
    timestamp: 0,
    email: 1,
    full_name: 2,
    dni: 3,
    telefono: 4,
    morning: 5,
    payment: 6,
  });
});
it('interpreta actividad y rango explícitos sin inventar duraciones', () => {
  expect(parseOption('Yoga Terapéutico Integral Lunes 10 a 11 hs', activities)).toMatchObject({
    activity_id: 1,
    day: 1,
    start: '10:00',
    end: '11:00',
  });
  expect(parseOption('Yoga Terapéutico Integral Lunes 10 hs', activities).end).toBe('');
  expect(parseOption('Gimnasia y Fortalecimiento Corporal Viernes 13:30', activities).end).toBe(
    '14:30',
  );
  expect(parseOption('Actividad desconocida Lunes 10 a 11 hs', activities).activity_id).toBe(0);
});
it('reconoce el alias explícito Programa acompañamiento cognitivo', () => {
  const result = parseOption('Programa acompañamiento cognitivo Jueves 10:30 a 12 hs', [
    { id: 3, name: 'Acompañamiento Cognitivo', instructor_id: 3, days: [2, 4] },
  ]);
  expect(result).toMatchObject({ activity_id: 3, day: 4, start: '10:30', end: '12:00' });
});
it('sugiere pagos con aprobación desactivada y deja fechas faltantes pendientes', () => {
  expect(parseFormPayment('35000 E 24/9', 2026)).toMatchObject({
    amount: '35000',
    method: 'cash',
    date: '2026-09-24',
    include: false,
    approved: false,
  });
  expect(parseFormPayment('10000 T', 2026).date).toBe('');
  expect(parseFormPayment('pago tal vez 2000', 2026).amount).toBe('');
});
it('exige revisión y aprobación del pago; las opciones ambiguas bloquean', () => {
  const row = {
    person: { nombre: 'Forms', apellido: 'Ficticia', telefono: '0000055533' },
    action: 'create',
    reviewed: false,
    selections: [],
    payment: parseFormPayment('10000 T 23/9', 2026),
  };
  expect(formRowSchema.safeParse(row).success).toBe(false);
  expect(formRowSchema.safeParse({ ...row, reviewed: true }).success).toBe(true);
  expect(
    formRowSchema.safeParse({ ...row, reviewed: true, payment: { ...row.payment, include: true } })
      .success,
  ).toBe(false);
  expect(
    formRowSchema.safeParse({
      ...row,
      reviewed: true,
      selections: [parseOption('sin reconocer', activities)],
    }).success,
  ).toBe(false);
});

it.each([
  ['Yoga Terapéutico Integral Lunes 10 a 11 hs', 'Yoga Terapéutico Integral', 1, '10:00', '11:00'],
  [
    'Movimiento y cuidado corporal Viernes 10 a 11 hs',
    'Movimiento y Cuidado Corporal',
    5,
    '10:00',
    '11:00',
  ],
  [
    'Yoga Terapéutico Integral Miércoles 17 a 18 hs',
    'Yoga Terapéutico Integral',
    3,
    '17:00',
    '18:00',
  ],
  [
    'Gimnasia y fortalecimiento corporal Viernes 13:30 hs',
    'Gimnasia y Fortalecimiento Corporal',
    5,
    '13:30',
    '14:30',
  ],
  [
    'Movimiento y cuidado corporal Lunes 17 a 18 hs',
    'Movimiento y Cuidado Corporal',
    1,
    '17:00',
    '18:00',
  ],
  ['Inclusión digital Lunes 14 a 16 hs', 'Inclusión Digital', 1, '14:00', '16:00'],
  ['Inclusión digital Miércoles 10 a 12 hs', 'Inclusión Digital', 3, '10:00', '12:00'],
  [
    'Taller de la memoria y estimulación cognitiva Jueves 15 a 17 hs',
    'Taller de la Memoria y Estimulación Cognitiva',
    4,
    '15:00',
    '17:00',
  ],
  [
    'Taller de la memoria y estimulación cognitiva Miércoles 16 a 18 hs',
    'Taller de la Memoria y Estimulación Cognitiva',
    3,
    '16:00',
    '18:00',
  ],
] as const)('mapea opción conocida: %s', (original, name, day, start, end) => {
  expect(parseOption(original, [{ id: 1, name, instructor_id: 1, days: [day] }])).toMatchObject({
    activity_id: 1,
    day,
    start,
    end,
  });
});
