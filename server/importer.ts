import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { personSchema, normalizePhone, normalizeDni, type PersonInput } from '../shared/domain.js';
import { AppError } from './errors.js';
export const clean = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export function validateXlsxSize(buffer: Buffer) {
  // Bound uncompressed XML before ExcelJS allocates it. ZIP64 is unnecessary for 5 MB imports.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new AppError(422, 'El archivo XLSX no es válido.');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16),
    total = 0;
  if (count > 2000) throw new AppError(422, 'El XLSX contiene demasiados elementos.');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new AppError(422, 'Estructura XLSX inválida.');
    const size = buffer.readUInt32LE(offset + 24);
    total += size;
    if (size > 20 * 1024 * 1024 || total > 40 * 1024 * 1024)
      throw new AppError(422, 'El contenido descomprimido del XLSX supera el límite permitido.');
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
export async function readImport(buffer: Buffer, filename: string, sheet?: string, headerRow = 1) {
  let matrix: string[][];
  let sheets: string[] = [];
  if (filename.toLowerCase().endsWith('.csv')) {
    const parsed = Papa.parse<string[]>(buffer.toString('utf8'), { skipEmptyLines: true });
    if (parsed.errors.length)
      throw new AppError(422, 'No se pudo leer el CSV. Revisá separadores y comillas.');
    matrix = parsed.data;
  } else if (filename.toLowerCase().endsWith('.xlsx')) {
    validateXlsxSize(buffer);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new AppError(422, 'No se pudo leer el XLSX. Verificá que no esté dañado ni protegido.');
    }
    sheets = wb.worksheets.map((s) => s.name);
    const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
    if (!ws) throw new AppError(422, 'Hoja inexistente.');
    if (ws.rowCount > 10000 || ws.columnCount > 100)
      throw new AppError(422, 'Máximo 10.000 filas y 100 columnas por hoja.');
    matrix = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let i = 1; i <= ws.columnCount; i++) cells.push(row.getCell(i).text);
      matrix.push(cells);
    });
  } else throw new AppError(422, 'Elegí un archivo XLSX o CSV.');
  if (matrix.length > 10000 || matrix.some((row) => row.length > 100))
    throw new AppError(422, 'Máximo 10.000 filas y 100 columnas.');
  const headers = matrix[headerRow - 1] || [];
  const rows = matrix.slice(headerRow).map((values, i) => ({ line: headerRow + i + 1, values }));
  return { sheets, headers, rows };
}
export function guessMapping(headers: string[]) {
  const aliases: Record<string, string[]> = {
    nombre: ['nombre'],
    apellido: ['apellido'],
    full_name: ['nombre y apellido', 'nombre completo'],
    telefono: ['telefono', 'tel', 'celular'],
    dni: ['dni'],
    email: ['email', 'mail'],
    direccion: ['direccion'],
    observaciones: ['observaciones'],
  };
  return Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [
      key,
      headers.findIndex((h) => names.includes(clean(h))),
    ]),
  );
}
export function mapRow(values: string[], mapping: Record<string, number>) {
  const p: Record<string, any> = {};
  for (const [key, index] of Object.entries(mapping)) if (index >= 0) p[key] = values[index] || '';
  let review = false;
  if (p.full_name && !p.nombre && !p.apellido) {
    const parts = p.full_name.trim().split(/\s+/);
    p.apellido = parts.pop() || '';
    p.nombre = parts.join(' ');
    review = true;
  }
  const parsed = personSchema.safeParse(p);
  return {
    person: p as PersonInput,
    review,
    errors: parsed.success ? [] : parsed.error.issues.map((i) => i.message),
    valid: parsed.success,
  };
}
export function strongMatch(a: PersonInput, b: PersonInput) {
  return (
    normalizePhone(a.telefono) === normalizePhone(b.telefono) ||
    Boolean(normalizeDni(a.dni) && normalizeDni(a.dni) === normalizeDni(b.dni)) ||
    Boolean(a.email && a.email.toLowerCase() === b.email.toLowerCase())
  );
}
