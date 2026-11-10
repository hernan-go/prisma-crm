import { migrate } from '../server/migrate';
import { query, execute, transaction } from '../server/db';

// Invoked only inside the opt-in DB test, through Vitest's guarded driver.
// No reset: refuse a used schema instead of adopting another suite's fixtures.
export async function prepareAnnualFixture() {
  const tables = await query('SHOW TABLES');
  if (tables.length !== 1 || !Object.values(tables[0]).includes('prisma_test_disposable_marker'))
    throw new Error('Annual fixture requires a fresh accredited schema');
  await migrate('019.sql');
  return transaction(async (db) => {
    const insert = async (sql: string, values: unknown[] = []) =>
      (await execute(sql, values, db)).insertId;
    const person = await insert(`INSERT INTO people
      (nombre,apellido,telefono,phone_normalized,direccion,observaciones,
       emergency_name,emergency_relationship,emergency_phone,emergency_notes)
      VALUES ('Synthetic','Annual QA','','','','','','','','')`);
    const activity = await insert(
      "INSERT INTO activities(name) VALUES ('Synthetic annual activity')",
    );
    for (const month of [1, 2]) {
      const period = await insert('INSERT INTO periods(year,month) VALUES (2091,?)', [month]);
      await insert('INSERT INTO period_memberships(person_id,period_id) VALUES (?,?)', [
        person,
        period,
      ]);
      const offering = await insert(
        "INSERT INTO period_activities(period_id,activity_id,name,mode) VALUES (?,?,'Synthetic annual activity','group')",
        [period, activity],
      );
      const enrollment = await insert(
        'INSERT INTO enrollments(person_id,period_id,activity_id) VALUES (?,?,?)',
        [person, period, activity],
      );
      const schedule = await insert(
        "INSERT INTO activity_schedules(offering_id,day,start,end) VALUES (?,1,'10:00','11:00')",
        [offering],
      );
      await insert(
        "INSERT INTO enrollment_slots(enrollment_id,schedule_id,day,start,end) VALUES (?,?,1,'10:00','11:00')",
        [enrollment, schedule],
      );
      const account = await insert(
        'INSERT INTO monthly_accounts(person_id,period_id,amount_due) VALUES (?,?,100.10)',
        [person, period],
      );
      await insert(
        "INSERT INTO payments(account_id,date,amount,method,recipient,notes) VALUES (?,? ,25.05,'cash','hernan','Synthetic annual fixture')",
        [account, `2091-0${month}-10`],
      );
    }
    return 2091;
  });
}
