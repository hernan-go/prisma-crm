import { Decimal } from 'decimal.js';
import { pool, query, type Connection } from '../db.js';
import { AppError } from '../errors.js';
import { readSummaryInput } from '../statistics/index.js';
import { calculateSummary } from '../statistics/engine.js';
import { facilitatorPending } from '../../shared/facilitators.js';
import { monthlyContextSchema, type MonthlyContext } from '../../shared/ai-context.js';

const available = <T>(data: T) => ({ status: 'available' as const, data });
const Money = Decimal.clone({ precision: 40 });
export interface OperationalRow {
  activity_id: number;
  name: string;
  enrollments: number;
  weekly_slots: number;
}
export interface OfferedSchedule {
  schedule_id: number;
  activity_id: number;
  activity: string;
  mode: 'group' | 'individual';
  day: number;
  start: string;
  end: string;
}
export interface ExpenseCategory {
  category_id: number;
  category_name: string;
  recurring_concept: string | null;
  controlled_concept: string;
  kind: 'recurring' | 'additional';
  amount: string;
  movement_count: number;
}
export type Combination = MonthlyContext['combinations']['data'][number];
export const missingPreviousPeriod: MonthlyContext['continuity'] = {
  status: 'unavailable',
  data: null,
  reason: 'previous_calendar_period_missing',
};

export function assembleMonthlyContext(
  input: Awaited<ReturnType<typeof readSummaryInput>>,
  enrolled: number,
  activities: OperationalRow[],
  schedules: OfferedSchedule[],
  categories: ExpenseCategory[],
  asOf: string,
  combinations: Combination[],
  continuity: MonthlyContext['continuity'] = missingPreviousPeriod,
) {
  const summary = calculateSummary(input, asOf);
  const members = input.members.length;
  const enrollments = activities.reduce((sum, a) => sum + a.enrollments, 0);
  const weeklySlots = activities.reduce((sum, a) => sum + a.weekly_slots, 0);
  if (enrolled < 0 || enrolled > members || activities.some((a) => a.enrollments > enrolled))
    throw new Error('Inconsistent contracting counts');
  if (
    combinations.reduce((n, c) => n + c.people, 0) !== enrolled ||
    combinations.reduce((n, c) => n + c.enrollments, 0) !== enrollments ||
    combinations.reduce((n, c) => n + c.weekly_slots, 0) !== weeklySlots
  )
    throw new Error('Inconsistent combinations');
  if (
    !categories
      .reduce((sum, c) => sum.plus(c.amount), new Money(0))
      .eq(summary.metrics.expenses.value) ||
    categories.reduce((n, c) => n + c.movement_count, 0) !== input.expenses.length
  )
    throw new Error('Inconsistent expense breakdown');
  const counts = activities.map((a) => a.enrollments);
  const extreme = (value: number) =>
    activities.filter((a) => a.enrollments === value).map((a) => a.activity_id);
  const metrics = summary.metrics;
  const agreements = input.fees.map((fee) => {
    const financial = calculateSummary(
      { period: input.period, members: [], fees: [fee], expenses: [] },
      asOf,
    );
    return {
      agreement_id: fee.account_id,
      offering_id: fee.offering_id,
      activity_id: fee.activity_id,
      activity: fee.activity,
      professional_id: fee.instructor_id,
      professional: fee.professional,
      amount_due: fee.amount_due,
      paid: financial.metrics.fees_paid.value,
      pending: facilitatorPending(fee.amount_due, fee.paid),
      excess: fee.amount_due === null ? null : financial.fees_overpaid.excess,
      payment_count: fee.payment_count,
    };
  });
  return monthlyContextSchema.parse({
    version: '2.0',
    period: summary.period,
    as_of: asOf,
    time_axis: 'economic_period',
    units: { money: 'ARS', people: 'unique_people', slots: 'weekly_slots' },
    privacy: {
      policy: 'authorized_business_read_v2',
      participant_identifiers: 'excluded',
      personal_free_text: 'excluded',
    },
    people: available({ members, enrolled, without_enrollment: members - enrolled }),
    contracting: available({
      enrollments,
      weekly_slots: weeklySlots,
      activities,
      highest_activity_ids: counts.length ? extreme(Math.max(...counts)) : [],
      lowest_activity_ids: counts.length ? extreme(Math.min(...counts)) : [],
    }),
    offered_schedules: schedules,
    combinations: available(combinations),
    continuity,
    collections: available({
      due: metrics.due,
      collected: metrics.collected,
      debt: metrics.debt,
      credit: metrics.credit,
      ...summary.collections!,
    }),
    fees: available({
      committed: metrics.fees_committed,
      paid: metrics.fees_paid,
      pending: metrics.fees_pending,
      overpaid_count: summary.fees_overpaid.count,
      overpaid_excess: summary.fees_overpaid.excess,
      agreements,
    }),
    expenses: available({
      registered: metrics.expenses,
      categories,
      breakdown_status: 'available',
      concept_detail: 'catalogue_or_category_only',
    }),
    coverage: {
      basis: 'retained_records',
      operational_completeness: 'unknown',
      expense_completeness: 'unknown',
    },
    sources: [
      'period_memberships',
      'enrollments',
      'enrollment_slots',
      'period_activities',
      'activity_schedules',
      'activities',
      'schedule_instructors',
      'instructors (operational name only)',
      'monthly_accounts',
      'payments',
      'facilitator_accounts',
      'facilitator_payments',
      'period_expense_categories',
      'period_expenses',
      'expense_recurring_concepts',
    ],
    unavailable: [
      'structured_historical_tariffs',
      'structured_promotions_discounts_packages',
      'incremental_cost_rules',
      'group_capacity',
      'income_attribution_by_activity',
      'actual_attendance',
      'complete_cancellation_and_correction_history',
      'structured_additional_expense_concepts',
      'structured_future_fee_terms',
    ],
    warnings: [
      'Acceso empresarial completo autorizado: no se suprimen grupos pequeños. No garantiza anonimato frente a conocimiento externo.',
      'Solo registros conservados; cambios y cancelaciones pueden haber eliminado historia. No acredita asistencia.',
      'Continuidad compara personas con inscripción en meses calendario consecutivos. Diferencias no prueban baja, abandono o primera incorporación real.',
      'Cobros y pagos de honorarios imputados al período económico, independientemente de su fecha efectiva.',
      'Gastos registrados no acredita gastos pagados ni carga completa.',
      'Conceptos controlados: catálogo recurrente o categoría empresarial. Se excluyen conceptos descriptivos libres y todas las notas.',
      'NULL, cuenta ausente y cero son distintos; value es subtotal conocido cuando coverage no es complete.',
      'Acuerdos: importe actual por oferta/profesional; no incluye notas privadas ni historial de renegociación. Nombre profesional operativo actual.',
      'Sin tarifas, paquetes contratados ni atribución de ingresos; no calcula rentabilidad ni utilidad neta.',
      'Horarios ofrecidos: catálogo, oferta y horario habilitados; no acredita cupo grupal disponible.',
    ],
  });
}

export async function readMonthlyContext(period: string, db: Connection, asOf: string) {
  const [year, month] = period.split('-').map(Number);
  const [ref] = await query<{ id: number }>(
    'SELECT id FROM periods WHERE year=? AND month=?',
    [year, month],
    db,
  );
  if (!ref) throw new AppError(404, 'Período inexistente.');
  const input = await readSummaryInput(ref.id, db);
  const [people] = await query<{ enrolled: number }>(
    'SELECT COUNT(DISTINCT person_id) enrolled FROM enrollments WHERE period_id=?',
    [ref.id],
    db,
  );
  const activities = await query<OperationalRow>(
    `SELECT o.activity_id,o.name,COUNT(e.id) enrollments,COALESCE(SUM(slots.n),0) weekly_slots
     FROM period_activities o LEFT JOIN enrollments e ON e.period_id=o.period_id AND e.activity_id=o.activity_id
     LEFT JOIN (SELECT enrollment_id,COUNT(*) n FROM enrollment_slots GROUP BY enrollment_id) slots ON slots.enrollment_id=e.id
     WHERE o.period_id=? GROUP BY o.id,o.activity_id,o.name ORDER BY o.activity_id LIMIT 501`,
    [ref.id],
    db,
  );
  activities.forEach((a) => {
    a.enrollments = Number(a.enrollments);
    a.weekly_slots = Number(a.weekly_slots);
  });
  const schedules = await query<OfferedSchedule>(
    `SELECT s.id schedule_id,o.activity_id,o.name activity,o.mode,s.day,s.start,s.end
     FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id JOIN activities a ON a.id=o.activity_id
     WHERE o.period_id=? AND o.active=1 AND s.active=1 AND a.active=1 ORDER BY s.id LIMIT 2001`,
    [ref.id],
    db,
  );
  const categories = await query<ExpenseCategory>(
    `SELECT c.id category_id,c.name category_name,r.name recurring_concept,
     COALESCE(r.name,c.name) controlled_concept,IF(c.recurring_concept_id IS NULL,'additional','recurring') kind,
     SUM(e.amount) amount,COUNT(*) movement_count
     FROM period_expense_categories c JOIN period_expenses e ON e.category_id=c.id
     LEFT JOIN expense_recurring_concepts r ON r.id=c.recurring_concept_id WHERE c.period_id=?
     GROUP BY c.id,c.name,r.name,c.recurring_concept_id ORDER BY c.id LIMIT 501`,
    [ref.id],
    db,
  );
  // Participant IDs remain inside SQL and never enter the exported data.
  const combinations = await query<{
    activity_key: string;
    expected_key_length: number;
    people: number;
    enrollments: number;
    weekly_slots: string;
  }>(
    `SELECT activity_key,MAX(key_length) expected_key_length,COUNT(*) people,SUM(enrollments) enrollments,SUM(weekly_slots) weekly_slots FROM (
       SELECT e.person_id,GROUP_CONCAT(e.activity_id ORDER BY e.activity_id SEPARATOR ',') activity_key,
       SUM(CHAR_LENGTH(CAST(e.activity_id AS CHAR)))+COUNT(*)-1 key_length,
       COUNT(*) enrollments,COALESCE(SUM(s.n),0) weekly_slots FROM enrollments e
       LEFT JOIN (SELECT enrollment_id,COUNT(*) n FROM enrollment_slots GROUP BY enrollment_id) s ON s.enrollment_id=e.id
       WHERE e.period_id=? GROUP BY e.person_id
     ) groups_by_person GROUP BY activity_key ORDER BY activity_key LIMIT 2001`,
    [ref.id],
    db,
  );
  if (
    activities.length > 500 ||
    schedules.length > 2000 ||
    categories.length > 500 ||
    combinations.length > 2000 ||
    input.fees.length > 2000
  )
    throw new AppError(413, 'Contexto demasiado extenso.');
  const combinationData = combinations.map((c) => {
    const ids = c.activity_key.split(',').map(Number);
    // Detect truncation instead of merging incomplete GROUP_CONCAT results.
    if (
      c.activity_key.length !== Number(c.expected_key_length) ||
      ids.length * Number(c.people) !== Number(c.enrollments) ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    )
      throw new Error('Invalid or truncated combination');
    return {
      activity_ids: ids,
      people: Number(c.people),
      enrollments: Number(c.enrollments),
      weekly_slots: Number(c.weekly_slots),
    };
  });
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const [previous] = await query<typeof input.period>(
    'SELECT id,year,month,status FROM periods WHERE year=? AND month=?',
    [previousYear, previousMonth],
    db,
  );
  let continuity: MonthlyContext['continuity'] = missingPreviousPeriod;
  if (previous) {
    const [counts] = await query<{ previously_enrolled: number; retained: number }>(
      `SELECT COUNT(*) previously_enrolled,COALESCE(SUM(EXISTS(SELECT 1 FROM enrollments current_e
         WHERE current_e.period_id=? AND current_e.person_id=prior.person_id)),0) retained
       FROM (SELECT DISTINCT person_id FROM enrollments WHERE period_id=?) prior`,
      [ref.id, previous.id],
      db,
    );
    const retained = Number(counts.retained);
    continuity = available({
      previous_period: previous,
      previously_enrolled: Number(counts.previously_enrolled),
      currently_enrolled: Number(people.enrolled),
      retained,
      new_in_pair: Number(people.enrolled) - retained,
      without_current_enrollment: Number(counts.previously_enrolled) - retained,
    });
  }
  return assembleMonthlyContext(
    input,
    Number(people.enrolled),
    activities,
    schedules,
    categories,
    asOf,
    combinationData,
    continuity,
  );
}

export async function monthlyContext(period: string) {
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const result = await readMonthlyContext(period, db, new Date().toISOString());
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
