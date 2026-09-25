import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { readImport, guessMapping, mapRow, strongMatch } from '../server/importer.js';
import { personSchema } from '../shared/domain.js';
const source = process.argv[2];
if (!source) throw new Error('Uso: npm run import:preview -- "ruta/PRISMA GESTIÓN .xlsx"');
const workbook = await readImport(await readFile(source), basename(source), 'Personas', 3);
const mapping = guessMapping(workbook.headers);
const records: any[] = [];
let discarded = 0;
for (const row of workbook.rows) {
  const mapped = mapRow(row.values, mapping);
  if (!mapped.person.nombre && !mapped.person.apellido && !mapped.person.telefono) {
    discarded++;
    continue;
  }
  const parsed = personSchema.safeParse(mapped.person);
  const matches = parsed.success
    ? records
        .filter((r) => r.valid && strongMatch(personSchema.parse(r.person), parsed.data))
        .map((r) => r.line)
    : [];
  records.push({
    line: row.line,
    ...mapped,
    duplicate_lines: matches,
    action: matches.length ? 'skip' : 'create',
    reviewed: false,
  });
}
const summary = {
  source: basename(source),
  sheet: 'Personas',
  headerRow: 3,
  total: records.length,
  valid: records.filter((r) => r.valid).length,
  incomplete: records.filter((r) => !r.valid).length,
  duplicates: records.filter((r) => r.duplicate_lines.length).length,
  discarded,
  requires_name_review: records.filter((r) => r.review).length,
};
await mkdir('private', { recursive: true });
await writeFile(
  resolve('private/import-preview.json'),
  JSON.stringify({ summary, mapping, records }, null, 2),
  'utf8',
);
console.log(JSON.stringify(summary, null, 2));
console.log(
  'Vista previa sensible guardada en private/import-preview.json (excluida de Git). No se modificó la base ni el Excel.',
);
