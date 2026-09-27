import { z } from 'zod';
import { days, personSchema, slotSchema, paymentSchema } from './domain.js';
export const normalizeLabel = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.¿?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export const formFields: Record<string, string> = {
  timestamp: 'Marca temporal',
  email: 'Email',
  full_name: 'Nombre completo',
  nombre: 'Nombre',
  apellido: 'Apellido',
  dni: 'DNI',
  telefono: 'Teléfono',
  direccion: 'Dirección',
  observaciones: 'Observaciones',
  hours: 'Nuestros horarios',
  morning: 'Turno mañana',
  afternoon: 'Turno tarde',
  reminder: 'Recordatorio',
  payment: 'Pago',
};
export function formsMapping(headers: string[]) {
  const aliases: Record<string, string[]> = {
    timestamp: ['marca temporal'],
    email: ['direccion de correo electronico', 'email', 'correo electronico'],
    full_name: ['nombre completo', 'nombre y apellido'],
    nombre: ['nombre'],
    apellido: ['apellido'],
    dni: ['dni'],
    telefono: ['numero de telefono (con codigo de area)', 'telefono'],
    direccion: ['direccion'],
    observaciones: ['observaciones'],
    hours: ['nuestros horarios'],
    morning: ['elegi la opcion que corresponde turno manana', 'turno manana'],
    afternoon: ['elegi la opcion que corresponde turno tarde', 'turno tarde'],
    reminder: ['recordatorio'],
    payment: ['pago'],
  };
  return Object.fromEntries(
    Object.entries(aliases).map(([k, names]) => [
      k,
      headers.findIndex((h) => names.includes(normalizeLabel(h))),
    ]),
  );
}
export type FormActivity = {
  id: number;
  name: string;
  instructor_id?: number;
  days: number[];
  active?: number | boolean;
};
// The only configured missing-end-time exception; do not infer duration from other classes.
export const explicitFormSchedules = [
  { name: 'Gimnasia y Fortalecimiento Corporal', day: 5, start: '13:30', end: '14:30' },
];
export function parseOption(original: string, activities: FormActivity[]) {
  const text = normalizeLabel(original);
  const result = {
    original,
    activity_id: 0,
    schedule_id: 0,
    instructor_ids: [] as number[],
    day: -1,
    start: '',
    end: '',
    include: true,
  };
  const day = days.findIndex((d) => new RegExp(`\\b${normalizeLabel(d)}\\b`).test(text));
  if (day < 0) return result;
  const dayName = normalizeLabel(days[day]);
  const rawName = text.slice(0, text.indexOf(dayName)).trim();
  const aliases: Record<string, string> = {
    'programa acompanamiento cognitivo': 'acompanamiento cognitivo',
  };
  const before = aliases[rawName] || rawName;
  const activity = activities.find(
    (a) => normalizeLabel(a.name) === before && a.active !== false && a.active !== 0,
  );
  if (!activity) return result;
  const after = text.slice(text.indexOf(dayName) + dayName.length).trim();
  const match = after.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(?:a|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(?:hs?|horas)?$/,
  );
  const hm = (h: string, m?: string) => `${h.padStart(2, '0')}:${m || '00'}`;
  let start = '',
    end = '';
  if (match) {
    start = hm(match[1], match[2]);
    end = hm(match[3], match[4]);
  } else {
    const one = after.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:hs?|horas)?$/);
    const explicit =
      one &&
      explicitFormSchedules.find(
        (s) => normalizeLabel(s.name) === before && s.day === day && s.start === hm(one[1], one[2]),
      );
    if (explicit) {
      start = explicit.start;
      end = explicit.end;
    }
  }
  return {
    ...result,
    activity_id: activity.id,

    day,
    start,
    end,
  };
}
export function parseFormPayment(original: string, year: number) {
  const m = original
    .trim()
    .match(/^(\d{1,10}(?:[.,]\d{1,2})?)\s+([TE])(?:\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?)?$/i);
  return {
    original,
    amount: m ? m[1].replace(',', '.') : '',
    method: m ? (m[2].toUpperCase() === 'T' ? 'transfer' : 'cash') : '',
    date: m?.[3] ? `${m[5] || year}-${m[4].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '',
    include: false,
    approved: false,
  };
}
export const formSelectionSchema = z
  .object({
    original: z.string().max(2000).default(''),
    include: z.boolean(),
    activity_id: z.number().int(),
    schedule_id: z.number().int(),
    instructor_ids: z.array(z.number().int()).default([]),
    day: z.number().int(),
    start: z.string(),
    end: z.string(),
  })
  .superRefine((s, ctx) => {
    if (!s.include) return;
    if (s.activity_id < 1 || s.schedule_id < 1 || !slotSchema.safeParse(s).success)
      ctx.addIssue({
        code: 'custom',
        message: 'Horario/opción no configurada. Resolvé o excluí explícitamente la opción.',
      });
  });
export const formPaymentSchema = z
  .object({
    original: z.string().max(2000).default(''),
    amount: z.string(),
    method: z.string(),
    date: z.string(),
    include: z.boolean(),
    approved: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (
      p.include &&
      (!p.approved || !paymentSchema.safeParse({ ...p, person_id: 1, period_id: 1 }).success)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Revisá monto, medio y fecha y aprobá explícitamente el pago.',
      });
  });
export const formRowSchema = z
  .object({
    person: z.unknown(),
    action: z.enum(['create', 'update', 'keep', 'skip']),
    target_id: z.number().int().positive().optional(),
    reviewed: z.boolean(),
    selections: z.array(formSelectionSchema).max(30),
    payment: formPaymentSchema,
  })
  .superRefine((r, ctx) => {
    if (r.action === 'skip') return;
    if (!r.reviewed)
      ctx.addIssue({
        code: 'custom',
        message: 'Cada respuesta seleccionada requiere aprobación individual.',
      });
    if (!personSchema.safeParse(r.person).success)
      ctx.addIssue({ code: 'custom', message: 'Revisá los datos obligatorios de la persona.' });
    if ((r.action === 'keep' || r.action === 'update') && !r.target_id)
      ctx.addIssue({ code: 'custom', message: 'Seleccioná la persona existente.' });
  });

// Parsing identifies the text only. Assignment comes exclusively from this period's persisted schedules.
export function resolveFormSelection(selection: ReturnType<typeof parseOption>, schedules: any[]) {
  const matches = schedules.filter(
    (s) =>
      s.activity_id === selection.activity_id &&
      s.day === selection.day &&
      s.start === selection.start &&
      s.end === selection.end &&
      s.active &&
      s.offered &&
      s.catalog_active,
  );
  return {
    ...selection,
    schedule_id: matches.length === 1 ? matches[0].id : 0,
    instructor_ids: matches.length === 1 ? matches[0].instructors.map((i: any) => i.id) : [],
    resolution: matches.length === 1 ? 'resolved' : matches.length ? 'ambiguous' : 'missing',
  };
}
