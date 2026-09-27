import { pool } from './db.js';
// No operational catalog, facilitators, periods or assignments are inferred by the seed.
// Existing installations remain untouched; new installations configure them manually in the UI.
export async function seed() {
  console.log(
    'Esquema listo. Configurá catálogo, facilitadores y oferta mensual desde PRISMA. No se crearon datos.',
  );
}
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    await seed();
  } finally {
    await pool.end();
  }
}
