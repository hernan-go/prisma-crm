import { describe, it, expect } from 'vitest';
import {
  personSchema,
  slotSchema,
  scheduleSchema,
  enrollmentSchema,
  paymentSchema,
  normalizePhone,
  normalizeDni,
  times,
  recipientLabel,
  paymentMethodLabel,
  balance,
  sumMoney,
  validateDays,
} from '../shared/domain.js';
import {
  guessMapping,
  mapRow,
  readImport,
  strongMatch,
  validateXlsxSize,
} from '../server/importer.js';
import ExcelJS from 'exceljs';
const person = { nombre: 'Persona', apellido: 'Prueba', telefono: '3411234567' };
describe('Personas y teléfonos', () => {
  it('normaliza DNI para comparar sin alterar el texto visible', () => {
    expect(normalizeDni('12.345.678')).toBe('12345678');
    expect(
      strongMatch(
        personSchema.parse({ ...person, dni: '12.345.678' }),
        personSchema.parse({ ...person, telefono: '0000011111', dni: '12345678' }),
      ),
    ).toBe(true);
  });
  it('exige nombre y apellido; permite teléfono ausente sin aceptar uno inválido', () => {
    for (const key of ['nombre', 'apellido'])
      expect(personSchema.safeParse({ ...person, [key]: '' }).success).toBe(false);
    expect(personSchema.safeParse({ ...person, telefono: '' }).success).toBe(true);
    expect(personSchema.safeParse({ ...person, telefono: '123' }).success).toBe(false);
  });
  it('preserva texto visible y normaliza Argentina', () => {
    expect(personSchema.parse({ ...person, telefono: '+54 9 341 1234567' }).telefono).toBe(
      '+54 9 341 1234567',
    );
    expect(normalizePhone('+54 9 341 1234567')).toBe(normalizePhone('341 1234567'));
  });
});
describe('Horarios y días', () => {
  it('incluye 45 intervalos de 15 minutos entre 09:00 y 20:00, sin duplicados', () => {
    expect(times).toHaveLength(45);
    expect(new Set(times).size).toBe(45);
    expect(times[0]).toBe('09:00');
    expect(times.at(-1)).toBe('20:00');
    const minutes = times.map((time) => {
      const [hour, minute] = time.split(':').map(Number);
      expect(time).toMatch(/^\d{2}:\d{2}$/);
      return hour * 60 + minute;
    });
    expect(minutes.slice(1).every((minute, i) => minute - minutes[i] === 15)).toBe(true);
  });
  it.each([
    ['18:15', '19:15'],
    ['09:15', '09:45'],
    ['19:45', '20:00'],
    ['09:00', '09:15'],
    ['09:00', '20:00'],
    ...Array.from({ length: 22 }, (_, i) => {
      const start = 9 * 60 + i * 30;
      const time = (minute: number) =>
        `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      return [time(start), time(start + 30)];
    }),
  ])('acepta %s - %s en validaciones compartidas y Configuración', (start, end) => {
    const slot = { day: 2, start, end };
    expect(slotSchema.parse(slot)).toEqual(slot);
    expect(scheduleSchema.safeParse({ ...slot, offering_id: 1, instructor_ids: [1] }).success).toBe(
      true,
    );
  });
  it.each([
    ['08:30', '10:00'],
    ['08:45', '09:15'],
    ['10:10', '11:00'],
    ['10:00', '11:20'],
    ['9:15', '10:15'],
    ['18:15', '18:15'],
    ['19:15', '18:15'],
    ['19:45', '20:15'],
    ['20:15', '20:30'],
    ['10:00', '10:00'],
    ['12:00', '11:00'],
    ['19:30', '20:30'],
  ])('rechaza %s - %s', (start, end) => {
    const slot = { day: 2, start, end };
    expect(slotSchema.safeParse(slot).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...slot, offering_id: 1, instructor_ids: [1] }).success).toBe(
      false,
    );
  });
  it('valida reglas configuradas', () => {
    expect(validateDays([{ day: 2 }, { day: 4 }], [2, 3, 4])).toBe(true);
    expect(validateDays([{ day: 1 }], [2, 3, 4])).toBe(false);
  });
  it('rechaza slots repetidos', () =>
    expect(
      enrollmentSchema.safeParse({
        person_id: 1,
        period_id: 1,
        activity_id: 1,
        schedule_ids: [1, 1],
      }).success,
    ).toBe(false));
});
describe('Dinero', () => {
  it('suma sin error binario', () => expect(sumMoney(['0.10', '0.20'])).toBe('0.30'));
  it('conserva indefinido, cero, deuda y sobrepago', () => {
    expect(balance(null, '20')).toBeNull();
    expect(balance('0', '0')).toBe('0.00');
    expect(balance('60000', '40000')).toBe('20000.00');
    expect(balance('10', '15')).toBe('-5.00');
  });
  it('etiqueta receptor y medio independientemente', () => {
    expect(recipientLabel('hernan')).toBe('Hernán');
    expect(recipientLabel('jesica')).toBe('Jésica');
    expect(paymentMethodLabel('cash')).toBe('Efectivo');
    expect(paymentMethodLabel('transfer')).toBe('Transferencia');
  });
  it('no acepta monto negativo ni fecha imposible', () => {
    expect(
      paymentSchema.safeParse({
        person_id: 1,
        period_id: 1,
        date: '2026-02-30',
        amount: '-1',
        method: 'cash',
        recipient: 'jesica',
      }).success,
    ).toBe(false);
  });
});
describe('Importación', () => {
  it('rechaza archivos falsos y tamaños XLSX descomprimidos excesivos', () => {
    expect(() => validateXlsxSize(Buffer.from('archivo inválido'))).toThrow('XLSX no es válido');
    const fake = Buffer.alloc(68);
    fake.writeUInt32LE(0x02014b50, 0);
    fake.writeUInt32LE(50000000, 24);
    fake.writeUInt32LE(0x06054b50, 46);
    fake.writeUInt16LE(1, 56);
    fake.writeUInt32LE(0, 62);
    expect(() => validateXlsxSize(fake)).toThrow('descomprimido');
  });
  it('detecta encabezados y exige revisión de nombre combinado', () => {
    const mapping = guessMapping(['Nombre y apellido', 'Teléfono', 'DNI']);
    const r = mapRow(['Ana María Prueba', '3411234567', ''], mapping);
    expect(r.review).toBe(true);
    expect(r.person.nombre).toBe('Ana María');
    expect(r.person.apellido).toBe('Prueba');
    expect(r.valid).toBe(true);
  });
  it('detecta incompletos y coincidencias fuertes', () => {
    expect(mapRow(['Ana'], { full_name: 0 }).valid).toBe(false);
    expect(
      strongMatch(
        personSchema.parse(person),
        personSchema.parse({ ...person, telefono: '+54 9 3411234567' }),
      ),
    ).toBe(true);
  });
  it('lee CSV con acentos', async () => {
    const r = await readImport(
      Buffer.from('Nombre;Apellido;Teléfono\nAna;Prueba;3411234567'),
      'test.csv',
    );
    expect(r.rows[0].values[2]).toBe('3411234567');
  });
  it('lee XLSX con título antes de encabezados', async () => {
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet('Personas');
    s.addRow(['Título']);
    s.addRow(['AGOSTO']);
    s.addRow(['Nombre y apellido', 'Teléfono']);
    s.addRow(['Ana Prueba', '3411234567']);
    const r = await readImport(Buffer.from(await w.xlsx.writeBuffer()), 'test.xlsx', 'Personas', 3);
    expect(r.headers[0]).toBe('Nombre y apellido');
    expect(r.rows[0].line).toBe(4);
  });
});
