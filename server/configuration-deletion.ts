import { query, execute, type Connection } from './db.js';
import { AppError, requireFound } from './errors.js';
import { openPeriod } from './scheduling.js';
import { requireRecurringSchema } from './recurring-periods.js';

// All callers hold peopleTransaction: configuration, admissions and finance share
// its cross-process lock. Locking reads also protect the rows being removed.
async function rejectReferences(
  db: Connection,
  sql: string,
  values: (number | string)[],
  message: string,
) {
  if ((await query(`${sql} FOR UPDATE`, values, db)).length) throw new AppError(409, message);
}

export async function requirePeriodWithoutBusinessData(period: number, db: Connection) {
  await rejectReferences(
    db,
    'SELECT p.id FROM payments p JOIN monthly_accounts m ON m.id=p.account_id WHERE m.period_id=?',
    [period],
    'El período conserva cobros. No puede eliminarse.',
  );
  await rejectReferences(
    db,
    'SELECT id FROM monthly_accounts WHERE period_id=?',
    [period],
    'El período conserva cuentas mensuales. No puede eliminarse.',
  );
  await rejectReferences(
    db,
    'SELECT id FROM enrollments WHERE period_id=?',
    [period],
    'El período conserva inscripciones. No puede eliminarse.',
  );
  await rejectReferences(
    db,
    'SELECT id FROM period_memberships WHERE period_id=?',
    [period],
    'El período conserva personas incorporadas. Quitalas explícitamente antes de eliminarlo.',
  );
  await rejectReferences(
    db,
    'SELECT p.id FROM facilitator_payments p JOIN facilitator_accounts c ON c.id=p.account_id JOIN period_activities o ON o.id=c.offering_id WHERE o.period_id=?',
    [period],
    'El período conserva pagos de facilitadores. No puede eliminarse.',
  );
  await rejectReferences(
    db,
    'SELECT c.id FROM facilitator_accounts c JOIN period_activities o ON o.id=c.offering_id WHERE o.period_id=?',
    [period],
    'El período conserva cuentas de facilitadores, incluso si el importe está sin definir.',
  );
  await rejectReferences(
    db,
    'SELECT e.id FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=?',
    [period],
    'El período conserva gastos. No puede eliminarse.',
  );
  // Do not depend on the enrollment period: detect external/inconsistent slots too.
  await rejectReferences(
    db,
    'SELECT es.id FROM enrollment_slots es JOIN activity_schedules s ON s.id=es.schedule_id JOIN period_activities o ON o.id=s.offering_id WHERE o.period_id=?',
    [period],
    'Hay referencias de inscripciones sobre horarios del período. Revisá las referencias incompatibles.',
  );
}

export async function deletePeriodConfiguration(period: number, db: Connection) {
  await requireRecurringSchema(db);
  const p = await openPeriod(period, db);
  await requirePeriodWithoutBusinessData(period, db);
  // The historical backup has no FK; preserve its economic period as well.
  const first = `${p.year}-${String(p.month).padStart(2, '0')}-01`;
  await rejectReferences(
    db,
    'SELECT id FROM advertising_investments WHERE date>=? AND date<DATE_ADD(?,INTERVAL 1 MONTH)',
    [first, first],
    'El período conserva publicidad histórica. Revisá esos datos antes de eliminarlo.',
  );
  await query(
    'SELECT id FROM period_expense_categories WHERE period_id=? FOR UPDATE',
    [period],
    db,
  );
  await query('SELECT id FROM period_activities WHERE period_id=? FOR UPDATE', [period], db);
  await query(
    'SELECT s.id FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id WHERE o.period_id=? FOR UPDATE',
    [period],
    db,
  );
  // No expenses were found above: never use the category cascade to remove money.
  await execute('DELETE FROM period_expense_categories WHERE period_id=?', [period], db);
  await execute(
    'DELETE si FROM schedule_instructors si JOIN activity_schedules s ON s.id=si.schedule_id JOIN period_activities o ON o.id=s.offering_id WHERE o.period_id=?',
    [period],
    db,
  );
  await execute(
    'DELETE s FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id WHERE o.period_id=?',
    [period],
    db,
  );
  await execute(
    'DELETE d FROM period_activity_days d JOIN period_activities o ON o.id=d.offering_id WHERE o.period_id=?',
    [period],
    db,
  );
  await execute('DELETE FROM period_activities WHERE period_id=?', [period], db);
  await execute('DELETE FROM period_recurring_concepts WHERE period_id=?', [period], db);
  await execute('DELETE FROM period_recurring_settings WHERE period_id=?', [period], db);
  await execute('DELETE FROM periods WHERE id=?', [period], db);
}

export async function deleteOfferingConfiguration(offering: number, db: Connection) {
  const [o] = await query('SELECT * FROM period_activities WHERE id=? FOR UPDATE', [offering], db);
  requireFound(o);
  await openPeriod(o.period_id, db);
  if (o.ever_used)
    throw new AppError(409, 'La oferta tiene uso histórico. Deshabilitala en lugar de eliminarla.');
  await rejectReferences(
    db,
    'SELECT id FROM activity_schedules WHERE offering_id=? AND ever_used=1',
    [offering],
    'La oferta conserva horarios utilizados. Deshabilitala en lugar de eliminarla.',
  );
  await rejectReferences(
    db,
    'SELECT id FROM enrollments WHERE period_id=? AND activity_id=?',
    [o.period_id, o.activity_id],
    'La oferta conserva inscripciones. No puede eliminarse.',
  );
  await rejectReferences(
    db,
    'SELECT id FROM facilitator_accounts WHERE offering_id=?',
    [offering],
    'La oferta conserva cuentas de facilitadores. No puede eliminarse.',
  );
  await rejectReferences(
    db,
    'SELECT es.id FROM enrollment_slots es JOIN activity_schedules s ON s.id=es.schedule_id WHERE s.offering_id=?',
    [offering],
    'Hay inscripciones que referencian horarios de esta oferta. No puede eliminarse.',
  );
  await query('SELECT id FROM activity_schedules WHERE offering_id=? FOR UPDATE', [offering], db);
  await execute(
    'DELETE si FROM schedule_instructors si JOIN activity_schedules s ON s.id=si.schedule_id WHERE s.offering_id=?',
    [offering],
    db,
  );
  await execute('DELETE FROM activity_schedules WHERE offering_id=?', [offering], db);
  await execute('DELETE FROM period_activity_days WHERE offering_id=?', [offering], db);
  await execute('DELETE FROM period_activities WHERE id=?', [offering], db);
}

export async function deleteScheduleConfiguration(schedule: number, db: Connection) {
  const [s] = await query(
    'SELECT s.*,o.period_id FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id WHERE s.id=? FOR UPDATE',
    [schedule],
    db,
  );
  requireFound(s);
  await openPeriod(s.period_id, db);
  if (s.ever_used)
    throw new AppError(
      409,
      'El horario tiene uso histórico. Deshabilitalo en lugar de eliminarlo.',
    );
  await rejectReferences(
    db,
    'SELECT id FROM enrollment_slots WHERE schedule_id=?',
    [schedule],
    'El horario conserva referencias de inscripciones. No puede eliminarse.',
  );
  await rejectReferences(
    db,
    'SELECT c.id FROM facilitator_accounts c JOIN schedule_instructors si ON si.instructor_id=c.instructor_id WHERE si.schedule_id=? AND c.offering_id=?',
    [schedule, s.offering_id],
    'El horario conserva asignaciones con cuentas de facilitadores. Debe conservarse su historial.',
  );
  await execute('DELETE FROM schedule_instructors WHERE schedule_id=?', [schedule], db);
  await execute('DELETE FROM activity_schedules WHERE id=?', [schedule], db);
}

// Shared by the API and QA cleanup, always inside the caller's transaction.
export async function deleteCatalogInDB(
  kind: 'activities' | 'instructors',
  id: number,
  db: Connection,
) {
  requireFound((await query(`SELECT id FROM ${kind} WHERE id=? FOR UPDATE`, [id], db))[0]);
  if (kind === 'activities') {
    await rejectReferences(
      db,
      'SELECT id FROM enrollments WHERE activity_id=?',
      [id],
      'La actividad conserva inscripciones. Archivala en lugar de eliminarla.',
    );
    await rejectReferences(
      db,
      'SELECT id FROM period_activities WHERE activity_id=?',
      [id],
      'Quitá primero la actividad de los períodos donde está configurada. Las ofertas históricas deben conservarse.',
    );
    await execute('DELETE FROM activity_allowed_days WHERE activity_id=?', [id], db);
  } else {
    await rejectReferences(
      db,
      'SELECT id FROM activities WHERE instructor_id=?',
      [id],
      'El facilitador conserva referencias de actividades del modelo anterior. Inactivalo para conservarlas.',
    );
    await rejectReferences(
      db,
      'SELECT p.id FROM facilitator_payments p JOIN facilitator_accounts c ON c.id=p.account_id WHERE c.instructor_id=?',
      [id],
      'El facilitador conserva pagos. Inactivalo en lugar de eliminarlo.',
    );
    await rejectReferences(
      db,
      'SELECT id FROM facilitator_accounts WHERE instructor_id=?',
      [id],
      'El facilitador conserva cuentas. Inactivalo en lugar de eliminarlo.',
    );
    const assignments = await query(
      'SELECT s.id,s.ever_used,o.period_id FROM schedule_instructors si JOIN activity_schedules s ON s.id=si.schedule_id JOIN period_activities o ON o.id=s.offering_id WHERE si.instructor_id=? FOR UPDATE',
      [id],
      db,
    );
    if (assignments.some((s) => s.ever_used))
      throw new AppError(
        409,
        'El facilitador tiene horarios utilizados. Inactivalo para conservar su historial.',
      );
    await rejectReferences(
      db,
      'SELECT es.id FROM enrollment_slots es JOIN schedule_instructors si ON si.schedule_id=es.schedule_id WHERE si.instructor_id=?',
      [id],
      'El facilitador tiene horarios referenciados por inscripciones. Debe conservarse.',
    );
    for (const period of new Set(assignments.map((s) => Number(s.period_id))))
      await openPeriod(period, db);
    await execute('DELETE FROM schedule_instructors WHERE instructor_id=?', [id], db);
  }
  await execute(`DELETE FROM ${kind} WHERE id=?`, [id], db);
  return { ok: true };
}
