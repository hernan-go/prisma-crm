import { offeringList, scheduleList } from './offerings.js';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readImport, mapRow, strongMatch } from './importer.js';
import {
  formsMapping,
  formFields,
  parseOption,
  formRowSchema,
  resolveFormSelection,
} from '../shared/forms.js';
import { personSchema } from '../shared/domain.js';
import { query, execute, peopleTransaction, pool } from './db.js';
import { duplicates, savePerson } from './repositories.js';
import { openPeriod } from './scheduling.js';
import { enrollmentInDB, paymentInDB } from './services.js';
import { AppError } from './errors.js';
export const formsImport = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
formsImport.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError(422, 'Falta el CSV de respuestas.');
  const periodId = z.coerce.number().int().positive().parse(req.body.period_id);
  const [period] = await query('SELECT * FROM periods WHERE id=?', [periodId]);
  if (!period || period.status !== 'open')
    throw new AppError(409, 'Seleccioná un período abierto.');
  const result = await readImport(req.file.buffer, req.file.originalname, undefined, 1);
  const requestedMapping = req.body.mapping
    ? z.record(z.string(), z.number().int().min(-1).max(99)).parse(JSON.parse(req.body.mapping))
    : formsMapping(result.headers);
  // Ignore removed/unknown fields even when an older client submits a manual mapping.
  const mapping = Object.fromEntries(
    Object.keys(formFields).map((key) => [key, requestedMapping[key] ?? -1]),
  );
  const offers = (await offeringList(periodId)).filter((o) => o.active && o.catalog_active);
  const list = offers.map((o) => ({ ...o, id: o.activity_id }));
  const schedules = await scheduleList(periodId);
  const rows: any[] = [];
  for (const source of result.rows) {
    const mapped = mapRow(source.values, mapping);
    const get = (k: string) => (mapping[k] >= 0 ? source.values[mapping[k]] || '' : '');
    const matches = mapped.valid ? await duplicates(personSchema.parse(mapped.person), pool) : [];
    const duplicate_lines = mapped.valid
      ? rows
          .filter(
            (r) =>
              r.valid &&
              strongMatch(personSchema.parse(r.person), personSchema.parse(mapped.person)),
          )
          .map((r) => r.line)
      : [];
    const options = [get('morning'), get('afternoon')]
      .flatMap((s) => s.split(/\s*[,;\n]\s*/))
      .filter(Boolean);
    const selections = options.map((s) => resolveFormSelection(parseOption(s, list), schedules));
    rows.push({
      ...source,
      ...mapped,
      matches,
      duplicate_lines,
      action: matches.length || duplicate_lines.length ? 'skip' : 'create',
      target_id: matches[0]?.id,
      reviewed: false,
      selections,
      // Preserve the existing review contract without deriving financial data from the CSV.
      payment: { original: '', amount: '', method: '', date: '', include: false, approved: false },
    });
  }
  res.json({ ...result, rows, mapping, activities: list, schedules });
});
formsImport.post('/commit', async (req, res) => {
  const body = z
    .object({
      period_id: z.number().int().positive(),
      request_id: z.uuid(),
      confirmed: z.literal(true),
      rows: z.array(z.unknown()).min(1).max(1000),
    })
    .parse(req.body);
  // Skipped rows may contain unresolved fields. They never reach writes.
  const rows = body.rows.map((r) =>
    (r as any)?.action === 'skip' ? { action: 'skip' as const } : formRowSchema.parse(r),
  );
  const hash = createHash('sha256')
    .update(JSON.stringify({ period: body.period_id, rows }))
    .digest('hex');
  const result = await peopleTransaction(async (db) => {
    const [receipt] = await query(
      'SELECT * FROM import_receipts WHERE id=?',
      [body.request_id],
      db,
    );
    if (receipt) {
      if (receipt.payload_hash !== hash)
        throw new AppError(409, 'La confirmación ya fue utilizada para otro lote.');
      return JSON.parse(receipt.result);
    }
    await openPeriod(body.period_id, db);
    let created = 0,
      updated = 0,
      kept = 0,
      skipped = 0,
      enrollments = 0,
      payments = 0;
    for (const row of rows) {
      if (row.action === 'skip') {
        skipped++;
        continue;
      }
      const person = personSchema.parse(row.person);
      const matches = await duplicates(person, db);
      let pid: number;
      if (row.action === 'create') {
        if (matches.length)
          throw new AppError(409, 'Persona existente. Revisá la coincidencia antes de importar.');
        pid = await savePerson(person, db);
        created++;
      } else {
        if (!row.target_id || !matches.some((m) => m.id === row.target_id))
          throw new AppError(409, 'La persona elegida debe coincidir por teléfono, DNI o email.');
        pid = row.target_id;
        const [old] = await query('SELECT * FROM people WHERE id=?', [pid], db);
        if (row.action === 'update') {
          await savePerson(
            {
              ...person,
              activo: !!old.activo,
              emergency_name: old.emergency_name,
              emergency_phone: old.emergency_phone,
              emergency_relationship: old.emergency_relationship,
              emergency_notes: old.emergency_notes,
            },
            db,
            pid,
          );
          updated++;
        } else kept++;
      }
      const grouped = new Map<number, any[]>();
      for (const selection of row.selections.filter((s) => s.include)) {
        const schedules = await scheduleList(body.period_id, db);
        const selected = schedules.find(
          (s) =>
            s.id === selection.schedule_id &&
            s.activity_id === selection.activity_id &&
            s.day === selection.day &&
            s.start === selection.start &&
            s.end === selection.end,
        );
        if (
          !selected ||
          JSON.stringify(
            selected.instructors.map((i: any) => i.id).sort((a: number, b: number) => a - b),
          ) !== JSON.stringify([...selection.instructor_ids].sort((a, b) => a - b))
        )
          throw new AppError(
            409,
            'La configuración del horario cambió o no corresponde. Volvé a revisar.',
          );
        grouped.set(selection.activity_id, [
          ...(grouped.get(selection.activity_id) || []),
          selection.schedule_id,
        ]);
      }
      for (const [activity_id, scheduleIds] of grouped) {
        const [old] = await query(
          'SELECT id FROM enrollments WHERE person_id=? AND period_id=? AND activity_id=?',
          [pid, body.period_id, activity_id],
          db,
        );
        const previous = old
          ? await query(
              'SELECT schedule_id FROM enrollment_slots WHERE enrollment_id=?',
              [old.id],
              db,
            )
          : [];
        await enrollmentInDB(
          {
            person_id: pid,
            period_id: body.period_id,
            activity_id,
            schedule_ids: [...new Set([...previous.map((s) => s.schedule_id), ...scheduleIds])],
          },
          db,
          old?.id,
        );
        enrollments++;
      }
      if (row.payment.include) {
        const p = row.payment;
        const [duplicate] = await query(
          'SELECT p.id FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE m.person_id=? AND m.period_id=? AND p.date=? AND p.amount=? AND p.method=?',
          [pid, body.period_id, p.date, p.amount, p.method],
          db,
        );
        if (duplicate)
          throw new AppError(
            409,
            'Ya hay un pago con igual persona, período, fecha, monto y medio. Revisalo y excluí el pago de la importación si corresponde.',
          );
        await paymentInDB(
          { ...p, person_id: pid, period_id: body.period_id, notes: p.original },
          db,
        );
        payments++;
      }
    }
    const result = { created, updated, kept, skipped, enrollments, payments };
    await execute(
      'INSERT INTO import_receipts(id,payload_hash,result) VALUES (?,?,?)',
      [body.request_id, hash, JSON.stringify(result)],
      db,
    );
    return result;
  });
  res.json(result);
});
