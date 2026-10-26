import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Decimal } from 'decimal.js';
import { pool, query, type Connection } from '../server/db.js';
import { readMonthlyContext } from '../server/integrations/ai-context.js';
import { readSummary } from '../server/statistics/index.js';

const Money = Decimal.clone({ precision: 40 });
const check = (value: boolean, label: string) => {
  if (!value) throw new Error(label);
};
const moneyEqual = (a: string, b: string) => new Money(a).eq(b);

// Explicit opt-in, target guard, READ ONLY, SELECT allowlist; no fixture/migration helpers.
export async function validateAiContextReadOnly() {
  check(process.env.RUN_AI_READ_DB_TESTS === 'true', 'Explicit read-only opt-in required');
  check(process.env.DB_NAME === 'prisma_test', 'Only prisma_test allowed');
  check(
    ['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST || '127.0.0.1'),
    'Only local MySQL allowed',
  );
  const db = await pool.getConnection();
  let started = false;
  const selectOnly: Connection = {
    execute: ((sql: string, values: any[]) => {
      check(
        /^\s*SELECT\b/i.test(sql) &&
          !/;|\b(INTO\s+(OUTFILE|DUMPFILE)|FOR\s+UPDATE|GET_LOCK|RELEASE_LOCK)\b/i.test(sql),
        'Non-read SQL rejected',
      );
      return db.execute(sql, values);
    }) as Connection['execute'],
  };
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    started = true;
    const [target] = await query<{ db: string }>('SELECT DATABASE() db', [], selectOnly);
    check(target.db === 'prisma_test', 'Unexpected database; stopped before business queries');
    const periods = await query<{ id: number; year: number; month: number }>(
      'SELECT id,year,month FROM periods ORDER BY year,month',
      [],
      selectOnly,
    );
    const coverage = {
      empty_period: false,
      members_without_activity: false,
      multiple_activities: false,
      multiple_slots: false,
      defined_zero: false,
      undefined_account: false,
      missing_account: false,
      partial_payment: false,
      credit: false,
      payment_outside_economic_month: false,
      undefined_fee: false,
      fee_without_assignment: false,
      expenses: false,
      recurring_expenses: false,
      additional_expenses: false,
      continuity_pair: false,
    };
    const results: { period: string; checks: string }[] = [];
    for (const p of periods) {
      const key = `${p.year}-${String(p.month).padStart(2, '0')}`;
      const context = await readMonthlyContext(key, selectOnly, new Date().toISOString());
      const summary = await readSummary(p.id, selectOnly, context.as_of);
      const [people] = await query<{
        members: number;
        enrolled: number;
        enrollments: number;
        slots: number;
      }>(
        `SELECT (SELECT COUNT(*) FROM period_memberships WHERE period_id=?) members,
        (SELECT COUNT(DISTINCT person_id) FROM enrollments WHERE period_id=?) enrolled,
        (SELECT COUNT(*) FROM enrollments WHERE period_id=?) enrollments,
        (SELECT COUNT(*) FROM enrollment_slots s JOIN enrollments e ON e.id=s.enrollment_id WHERE e.period_id=?) slots`,
        [p.id, p.id, p.id, p.id],
        selectOnly,
      );
      check(
        context.people.data.members === Number(people.members) &&
          context.people.data.enrolled === Number(people.enrolled),
        'People mismatch',
      );
      check(
        context.contracting.data.enrollments === Number(people.enrollments) &&
          context.contracting.data.weekly_slots === Number(people.slots),
        'Contracting mismatch',
      );
      const activityCounts = await query<{ activity_id: number; n: number }>(
        'SELECT activity_id,COUNT(*) n FROM enrollments WHERE period_id=? GROUP BY activity_id',
        [p.id],
        selectOnly,
      );
      for (const a of context.contracting.data.activities)
        check(
          a.enrollments ===
            Number(activityCounts.find((r) => r.activity_id === a.activity_id)?.n || 0),
          'Activity mismatch',
        );
      check(
        activityCounts.every((a) =>
          context.contracting.data.activities.some((r) => r.activity_id === a.activity_id),
        ),
        'Enrollment without offering',
      );
      const [offered] = await query<{ n: number }>(
        `SELECT COUNT(*) n FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id JOIN activities a ON a.id=o.activity_id
         WHERE o.period_id=? AND s.active=1 AND o.active=1 AND a.active=1`,
        [p.id],
        selectOnly,
      );
      check(context.offered_schedules.length === Number(offered.n), 'Offered schedules mismatch');
      // IDs are used only in memory to independently validate exact combinations; never logged/exported.
      const combinations = await query<{ person_id: number; activity_id: number; n: number }>(
        `SELECT e.person_id,e.activity_id,COUNT(s.id) n FROM enrollments e LEFT JOIN enrollment_slots s ON s.enrollment_id=e.id
         WHERE e.period_id=? GROUP BY e.id,e.person_id,e.activity_id ORDER BY e.person_id,e.activity_id`,
        [p.id],
        selectOnly,
      );
      const byPerson = new Map<number, typeof combinations>();
      for (const r of combinations)
        byPerson.set(r.person_id, [...(byPerson.get(r.person_id) || []), r]);
      const byCombination = new Map<
        string,
        { people: number; enrollments: number; weekly_slots: number }
      >();
      for (const rows of byPerson.values()) {
        const combo = rows.map((r) => r.activity_id).join(',');
        const value = byCombination.get(combo) || { people: 0, enrollments: 0, weekly_slots: 0 };
        value.people++;
        value.enrollments += rows.length;
        value.weekly_slots += rows.reduce((n, r) => n + Number(r.n), 0);
        byCombination.set(combo, value);
        coverage.multiple_activities ||= rows.length > 1;
        coverage.multiple_slots ||= rows.some((r) => Number(r.n) > 1);
      }
      check(byCombination.size === context.combinations.data.length, 'Combination count mismatch');
      for (const c of context.combinations.data)
        check(
          JSON.stringify(byCombination.get(c.activity_ids.join(','))) ===
            JSON.stringify({
              people: c.people,
              enrollments: c.enrollments,
              weekly_slots: c.weekly_slots,
            }),
          'Combination mismatch',
        );
      const [accounts] = await query<Record<string, string>>(
        `SELECT COALESCE(SUM(m.amount_due),0) due,COALESCE(SUM(COALESCE(pay.paid,0)),0) collected,
        COALESCE(SUM(GREATEST(m.amount_due-COALESCE(pay.paid,0),0)),0) debt,
        COALESCE(SUM(GREATEST(COALESCE(pay.paid,0)-m.amount_due,0)),0) credit,
        COALESCE(SUM(LEAST(m.amount_due,COALESCE(pay.paid,0))),0) applied,
        COALESCE(SUM(IF(m.amount_due IS NULL,COALESCE(pay.paid,0),0)),0) undefined_paid,
        COUNT(*) account_count,COUNT(m.amount_due) defined,SUM(m.amount_due=0) zero_count,SUM(m.amount_due IS NULL) undefined_count,
        SUM(m.amount_due>COALESCE(pay.paid,0) AND COALESCE(pay.paid,0)>0) partial_count
        FROM monthly_accounts m LEFT JOIN (SELECT account_id,SUM(amount) paid FROM payments GROUP BY account_id) pay ON pay.account_id=m.id
        WHERE m.period_id=?`,
        [p.id],
        selectOnly,
      );
      const exported = context.collections.data;
      check(
        exported.due.defined === Number(accounts.defined) &&
          exported.due.undefined === Number(accounts.undefined_count || 0) &&
          exported.due.missing === Number(people.members) - Number(accounts.account_count),
        'Account coverage mismatch',
      );
      for (const field of ['due', 'collected', 'debt', 'credit'] as const) {
        check(moneyEqual(exported[field].value, accounts[field]), `Financial ${field} mismatch`);
        check(
          JSON.stringify(exported[field]) === JSON.stringify(summary.metrics[field]),
          `Engine ${field} mismatch`,
        );
      }
      check(
        moneyEqual(exported.applied_known, accounts.applied) &&
          moneyEqual(exported.collected_undefined, accounts.undefined_paid),
        'Applied collections mismatch',
      );
      check(
        new Money(exported.applied_known).plus(exported.debt.value).eq(exported.due.value),
        'Due reconciliation',
      );
      check(
        new Money(exported.applied_known)
          .plus(exported.credit.value)
          .plus(exported.collected_undefined)
          .eq(exported.collected.value),
        'Collection reconciliation',
      );
      const [outOfMonth] = await query<{ n: number }>(
        `SELECT COUNT(*) n FROM payments pay JOIN monthly_accounts m ON m.id=pay.account_id JOIN periods p ON p.id=m.period_id
         WHERE m.period_id=? AND (YEAR(pay.date)<>p.year OR MONTH(pay.date)<>p.month)`,
        [p.id],
        selectOnly,
      );
      const fees = await query<{
        id: number;
        offering_id: number;
        instructor_id: number;
        due: string | null;
        paid: string;
        payments: number;
        assigned: number;
      }>(
        `SELECT a.id,a.offering_id,a.instructor_id,a.amount_due due,COALESCE(SUM(pay.amount),0) paid,COUNT(pay.id) payments,
        EXISTS(SELECT 1 FROM activity_schedules s JOIN schedule_instructors si ON si.schedule_id=s.id WHERE s.offering_id=a.offering_id AND si.instructor_id=a.instructor_id) assigned
        FROM facilitator_accounts a JOIN period_activities o ON o.id=a.offering_id LEFT JOIN facilitator_payments pay ON pay.account_id=a.id
        WHERE o.period_id=? GROUP BY a.id,a.offering_id,a.instructor_id,a.amount_due`,
        [p.id],
        selectOnly,
      );
      for (const f of fees) {
        const a = context.fees.data.agreements.find((r) => r.agreement_id === f.id);
        check(
          Boolean(a) &&
            a!.amount_due === f.due &&
            moneyEqual(a!.paid, f.paid) &&
            a!.payment_count === Number(f.payments),
          'Agreement mismatch',
        );
      }
      const assignments = await query<{ offering_id: number; instructor_id: number }>(
        `SELECT DISTINCT s.offering_id,si.instructor_id FROM activity_schedules s JOIN period_activities o ON o.id=s.offering_id
         JOIN schedule_instructors si ON si.schedule_id=s.id WHERE o.period_id=?`,
        [p.id],
        selectOnly,
      );
      const pairs = new Set(
        [...assignments, ...fees].map((r) => `${r.offering_id}:${r.instructor_id}`),
      );
      check(context.fees.data.agreements.length === pairs.size, 'Agreement universe mismatch');
      check(
        context.fees.data.committed.defined === fees.filter((r) => r.due !== null).length &&
          context.fees.data.committed.undefined === fees.filter((r) => r.due === null).length &&
          context.fees.data.committed.missing === pairs.size - fees.length,
        'Agreement coverage mismatch',
      );
      check(
        moneyEqual(
          context.fees.data.committed.value,
          fees.reduce((n, f) => n.plus(f.due || 0), new Money(0)).toFixed(2),
        ),
        'Fee commitments mismatch',
      );
      check(
        moneyEqual(
          context.fees.data.paid.value,
          fees.reduce((n, f) => n.plus(f.paid), new Money(0)).toFixed(2),
        ),
        'Fee payments mismatch',
      );
      check(
        moneyEqual(
          context.fees.data.pending.value,
          fees
            .reduce(
              (n, f) => n.plus(f.due === null ? 0 : Money.max(new Money(f.due).minus(f.paid), 0)),
              new Money(0),
            )
            .toFixed(2),
        ),
        'Fee pending mismatch',
      );
      for (const [field, metric] of [
        ['committed', 'fees_committed'],
        ['paid', 'fees_paid'],
        ['pending', 'fees_pending'],
      ] as const)
        check(
          JSON.stringify(context.fees.data[field]) === JSON.stringify(summary.metrics[metric]),
          'Fee engine mismatch',
        );
      const expenseGroups = await query<{ category_id: number; amount: string; n: number }>(
        `SELECT e.category_id,SUM(e.amount) amount,COUNT(*) n FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE c.period_id=? GROUP BY e.category_id`,
        [p.id],
        selectOnly,
      );
      check(
        expenseGroups.length === context.expenses.data.categories.length,
        'Expense categories mismatch',
      );
      for (const c of context.expenses.data.categories) {
        const expected = expenseGroups.find((r) => r.category_id === c.category_id);
        check(
          Boolean(expected) &&
            moneyEqual(c.amount, expected!.amount) &&
            c.movement_count === Number(expected!.n),
          'Expense category mismatch',
        );
      }
      check(
        moneyEqual(
          context.expenses.data.registered.value,
          expenseGroups.reduce((n, r) => n.plus(r.amount), new Money(0)).toFixed(2),
        ),
        'Expense total mismatch',
      );
      check(
        JSON.stringify(context.expenses.data.registered) ===
          JSON.stringify(summary.metrics.expenses),
        'Expense engine mismatch',
      );
      if (context.continuity.status === 'available') {
        const c = context.continuity.data;
        const [prior] = await query<{ n: number; retained: number }>(
          `SELECT COUNT(DISTINCT a.person_id) n,COUNT(DISTINCT b.person_id) retained FROM enrollments a LEFT JOIN enrollments b
           ON b.person_id=a.person_id AND b.period_id=? WHERE a.period_id=?`,
          [p.id, c.previous_period.id],
          selectOnly,
        );
        check(
          c.previously_enrolled === Number(prior.n) && c.retained === Number(prior.retained),
          'Continuity mismatch',
        );
        check(
          c.retained + c.new_in_pair === Number(people.enrolled) &&
            c.retained + c.without_current_enrollment === Number(prior.n),
          'Continuity reconciliation',
        );
        coverage.continuity_pair = true;
      }
      coverage.empty_period ||= Number(people.members) === 0;
      coverage.members_without_activity ||= Number(people.members) > Number(people.enrolled);
      coverage.defined_zero ||= Number(accounts.zero_count) > 0;
      coverage.undefined_account ||= Number(accounts.undefined_count) > 0;
      coverage.missing_account ||= exported.due.missing > 0;
      coverage.partial_payment ||= Number(accounts.partial_count) > 0;
      coverage.credit ||= new Money(accounts.credit).gt(0);
      coverage.payment_outside_economic_month ||= Number(outOfMonth.n) > 0;
      coverage.undefined_fee ||=
        context.fees.data.committed.undefined + context.fees.data.committed.missing > 0;
      coverage.fee_without_assignment ||= fees.some((f) => !Number(f.assigned));
      coverage.expenses ||= expenseGroups.length > 0;
      coverage.recurring_expenses ||= context.expenses.data.categories.some(
        (c) => c.kind === 'recurring',
      );
      coverage.additional_expenses ||= context.expenses.data.categories.some(
        (c) => c.kind === 'additional',
      );
      results.push({ period: key, checks: 'all_reconciled' });
    }
    return {
      database: 'prisma_test',
      read_only: true,
      periods_checked: results,
      coverage,
      missing_real_cases: Object.entries(coverage)
        .filter(([, value]) => !value)
        .map(([key]) => key),
    };
  } finally {
    try {
      if (started) await db.rollback();
    } finally {
      db.release();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await validateAiContextReadOnly(), null, 2));
  } catch (error) {
    // Only our fixed assertion labels are public. Driver messages/SQL never leave this script.
    const code =
      error && typeof error === 'object' && 'code' in error
        ? 'database_connection_or_query_failed'
        : 'validation_failed';
    console.error(
      JSON.stringify({
        status: 'failed',
        code,
        check: error instanceof Error && !('code' in error) ? error.message : undefined,
      }),
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
