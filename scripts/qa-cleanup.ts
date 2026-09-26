import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cleanupPlan, applyCleanup } from '../server/qa-cleanup.js';
import { pool } from '../server/db.js';
const file = 'private/qa-cleanup-plan.json';
try {
  if (process.argv.includes('--apply')) {
    const database = process.argv[process.argv.indexOf('--database') + 1];
    if (!process.argv.includes('--database') || !process.argv.includes('--backup-confirmed'))
      throw new Error(
        'Requiere --database NOMBRE --backup-confirmed y revisión individual del plan.',
      );
    console.log(await applyCleanup(JSON.parse(await readFile(file, 'utf8')), database));
  } else {
    await mkdir('private', { recursive: true });
    const plan = await cleanupPlan();
    await writeFile(file, JSON.stringify(plan, null, 2), { flag: 'wx' });
    console.log(
      `Plan de ${plan.candidates.length} candidatos guardado en ${file}. No se eliminó nada. Revisar registros y relaciones antes de marcar reviewed=true.`,
    );
  }
} finally {
  await pool.end();
}
