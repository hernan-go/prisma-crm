import { it, expect } from 'vitest';
import {
  formFields,
  formsMapping,
  formsSourceColumns,
  parseOption,
  formRowSchema,
} from '../shared/forms.js';
const activities = [
  { id: 1, name: 'Yoga Terapéutico Integral', instructor_id: 1, days: [1, 3] },
  { id: 2, name: 'Gimnasia y Fortalecimiento Corporal', instructor_id: 2, days: [5] },
];
it('oculta columnas retiradas en selects Forms conservando los diez campos e índices CSV', () => {
  const headers = [
    'Marca temporal',
    'Nombre de usuario',
    'Nombre completo',
    'Nuestros horarios',
    'Nombre',
    'Apellido',
    'DNI',
    'Recordatorios para participar en las actividades de PRISMA',
    'Teléfono',
    'Dirección',
    'Observaciones',
    'Pago',
    'Turno mañana',
    'Turno tarde',
    'Recordatorio',
  ];
  const original = [...headers];
  expect(formsSourceColumns(headers)).toEqual(
    [1, 2, 4, 5, 6, 8, 9, 10, 12, 13].map((index) => ({ header: headers[index], index })),
  );
  expect(headers).toEqual(original);
  expect(formsMapping(headers).email).toBe(1);
});
it('filtra fuentes Forms con normalización explícita, sin excluir otras columnas', () => {
  expect(
    formsSourceColumns([
      '  MARCA   TEMPORAL. ',
      '¿Nuestros horarios?',
      'Recordatório',
      ' RECORDATORIOS PARA PARTICIPAR EN LAS ACTIVIDADES DE PRISMA. ',
      'PAGO',
      'Email',
      'Observaciones sobre pago',
      '',
    ]),
  ).toEqual([
    { header: 'Email', index: 5 },
    { header: 'Observaciones sobre pago', index: 6 },
    { header: '', index: 7 },
  ]);
});
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
    email: 1,
    full_name: 2,
    dni: 3,
    telefono: 4,
    morning: 5,
  });
});
it.each([
  'Nombre de usuario',
  'Dirección de correo electrónico',
  'Email',
  'Correo electrónico',
  '  NOMBRE   DE USUARIO.  ',
])('reconoce el alias explícito de email: %s', (header) => {
  const mapping = formsMapping([
    'Marca temporal',
    header,
    'Nombre Completo.',
    'D.N.I',
    'Número de Teléfono (con código de área)',
    'Dirección',
  ]);
  expect(mapping).toMatchObject({ email: 1, full_name: 2, dni: 3, telefono: 4, direccion: 5 });
});
it('no usa coincidencias difusas para email', () => {
  expect(formsMapping(['Nombre de usuario alternativo', 'Correo', 'Nombre']).email).toBe(-1);
});
it('Forms solo expone los diez campos operativos de correspondencia', () => {
  const fields = [
    'email',
    'full_name',
    'nombre',
    'apellido',
    'dni',
    'telefono',
    'direccion',
    'observaciones',
    'morning',
    'afternoon',
  ];
  expect(Object.keys(formFields)).toEqual(fields);
  const mapping = formsMapping([
    'Marca temporal',
    'Nuestros horarios',
    'Recordatorio',
    'Pago',
    'Turno mañana',
    'Turno tarde',
  ]);
  expect(Object.keys(mapping)).toEqual(fields);
  expect(mapping).toMatchObject({ morning: 4, afternoon: 5 });
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
it('exige revisión individual y datos del pago incluido; las opciones ambiguas bloquean', () => {
  const row = {
    person: { nombre: 'Forms', apellido: 'Ficticia', telefono: '0000055533' },
    action: 'create',
    reviewed: false,
    selections: [],
    amount_due: '',
    payment: { amount: '', method: '', date: '', include: false },
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
it.each(['', '0', '35000', '35000.50'])('acepta A cobrar manual %j sin pago', (amount_due) => {
  expect(
    formRowSchema.safeParse({
      person: { nombre: 'Cuenta', apellido: 'Sintética', telefono: '0000055533' },
      action: 'create',
      reviewed: true,
      selections: [],
      amount_due,
      payment: { include: false, amount: 'residual', method: 'otro', date: 'inválida' },
    }).success,
  ).toBe(true);
});
it.each(['-1', '1.001', 'NaN', '1e3', '10000000000', 'texto'])(
  'rechaza A cobrar inválido %j',
  (amount_due) => {
    expect(
      formRowSchema.safeParse({
        person: { nombre: 'Cuenta', apellido: 'Sintética', telefono: '0000055533' },
        action: 'create',
        reviewed: true,
        selections: [],
        amount_due,
        payment: { include: false, amount: '', method: '', date: '' },
      }).success,
    ).toBe(false);
  },
);
it.each([
  [{ amount: '20000', method: 'transfer', date: '2032-01-15' }, true],
  [{ amount: '35000', method: 'cash', date: '2032-01-15' }, true],
  [{ amount: '', method: 'transfer', date: '2032-01-15' }, false],
  [{ amount: '0', method: 'cash', date: '2032-01-15' }, false],
  [{ amount: '-1', method: 'cash', date: '2032-01-15' }, false],
  [{ amount: '1.001', method: 'cash', date: '2032-01-15' }, false],
  [{ amount: '20000', method: 'otro', date: '2032-01-15' }, false],
  [{ amount: '20000', method: 'transfer', date: '' }, false],
  [{ amount: '20000', method: 'transfer', date: '2032-02-30' }, false],
])('valida pago inicial manual %j sin segundo check', (payment, valid) => {
  expect(
    formRowSchema.safeParse({
      person: { nombre: 'Cuenta', apellido: 'Sintética', telefono: '0000055533' },
      action: 'create',
      reviewed: true,
      selections: [],
      amount_due: '35000',
      payment: { ...payment, recipient: 'jesica', include: true },
    }).success,
  ).toBe(valid);
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
