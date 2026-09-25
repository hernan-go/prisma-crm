import { execute, query, transaction, pool } from './db.js';
const seeds: [string, string, number[]][] = [
  ['Yoga Terapéutico Integral', 'Laura', [1, 3]],
  ['Movimiento y Cuidado Corporal', 'Laura', [1, 5]],
  ['Taller de la Memoria y Estimulación Cognitiva', 'Jesica', [2, 3, 4]],
  ['Inclusión Digital', 'Hernán', [1, 2, 3]],
  ['Informática', 'Hernán', [1, 2, 3, 4, 5, 6]],
  ['Acompañamiento Cognitivo', 'Mariela', [2, 4]],
  ['Taller de Tejido', 'Valeria', [1, 5]],
  ['Gimnasia y Fortalecimiento Corporal', 'Simón', [5]],
];
export async function seed() {
  await transaction(async (db) => {
    for (const [name, teacher, days] of seeds) {
      await execute('INSERT IGNORE INTO instructors(name) VALUES (?)', [teacher], db);
      const [i] = await query('SELECT id FROM instructors WHERE name=?', [teacher], db);
      const result = await execute(
        'INSERT IGNORE INTO activities(name,instructor_id) VALUES (?,?)',
        [name, i.id],
        db,
      );
      if (result.affectedRows)
        for (const day of days)
          await execute(
            'INSERT INTO activity_allowed_days(activity_id,day) VALUES (?,?)',
            [result.insertId, day],
            db,
          );
    }
  });
  console.log('Configuración inicial lista. No se importaron personas.');
}
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    await seed();
  } finally {
    await pool.end();
  }
}
