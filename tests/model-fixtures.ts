import { query, execute } from '../server/db.js';
// These fixtures are restricted to the disposable integration database, never production seeds.
export async function resetTestSchema() {
  if (
    process.env.RUN_DB_TESTS !== 'true' ||
    process.env.DB_NAME !== 'prisma_test' ||
    (await query('SELECT DATABASE() name'))[0].name !== 'prisma_test'
  )
    throw new Error('Only prisma_test');
  for (const t of [
    'knowledge_document_versions',
    'knowledge_documents',
    'knowledge_categories',
    'knowledge_library_state',
    'period_recurring_concepts',
    'period_recurring_settings',
    'period_expenses',
    'period_expense_categories',
    'expense_recurring_concepts',
    'facilitator_payments',
    'facilitator_accounts',
    'enrollment_slots',
    'payments',
    'monthly_accounts',
    'enrollments',
    'period_memberships',
    'schedule_instructors',
    'activity_schedules',
    'period_activity_days',
    'period_activities',
    'activity_allowed_days',
    'activities',
    'instructors',
    'people',
    'periods',
    'advertising_investments',
    'admin_sessions',
    'import_receipts',
    'schema_migrations',
  ])
    await execute(`DROP TABLE IF EXISTS ${t}`);
}
const configs: [string, string, number[]][] = [
  ['Yoga Terapéutico Integral', 'Laura', [1, 3]],
  ['Movimiento y Cuidado Corporal', 'Laura', [1, 5]],
  ['Taller de la Memoria y Estimulación Cognitiva', 'Jesica', [2, 3, 4]],
  ['Inclusión Digital', 'Hernán', [1, 2, 3]],
  ['Informática', 'Hernán', [1, 2, 3, 4, 5, 6]],
  ['Acompañamiento Cognitivo', 'Mariela', [2, 4]],
  ['Taller de Tejido', 'Valeria', [1, 5]],
  ['Gimnasia y Fortalecimiento Corporal', 'Simón', [5]],
];
export async function legacyFixture(migration = true) {
  if (process.env.DB_NAME !== 'prisma_test') throw new Error('Only prisma_test');
  if (migration) {
    const teacher = (
      await execute("INSERT INTO instructors(name) VALUES ('Facilitador migración')")
    ).insertId;
    const a = (
      await execute(
        "INSERT INTO activities(name,instructor_id,mode) VALUES ('Individual migración',?,'individual')",
        [teacher],
      )
    ).insertId;
    const pr = (await execute('INSERT INTO periods(year,month) VALUES (2026,9)')).insertId;
    const person = (
      await execute(
        "INSERT INTO people(nombre,apellido,telefono,phone_normalized,direccion,observaciones,emergency_name,emergency_relationship,emergency_phone,emergency_notes) VALUES ('Migración','Sintética','0000009191','0000009191','','','','','','')",
      )
    ).insertId;
    const e = (
      await execute('INSERT INTO enrollments(person_id,period_id,activity_id) VALUES (?,?,?)', [
        person,
        pr,
        a,
      ])
    ).insertId;
    await execute(
      "INSERT INTO enrollment_slots(enrollment_id,day,start,end) VALUES (?,1,'11:00','12:30')",
      [e],
    );
    const acc = (
      await execute(
        'INSERT INTO monthly_accounts(person_id,period_id,amount_due) VALUES (?,?,50000)',
        [person, pr],
      )
    ).insertId;
    for (const method of ['cash', 'transfer'])
      await execute(
        "INSERT INTO payments(account_id,date,amount,method,notes) VALUES (?,'2026-09-01',25000,?,'')",
        [acc, method],
      );
    return;
  }
  for (const [name, teacher, days] of configs) {
    let [i] = await query('SELECT id FROM instructors WHERE name=?', [teacher]);
    if (!i)
      i = { id: (await execute('INSERT INTO instructors(name) VALUES (?)', [teacher])).insertId };
    const a = (
      await execute('INSERT INTO activities(name,mode) VALUES (?,?)', [
        name,
        name === 'Informática' ? 'individual' : 'group',
      ])
    ).insertId;
    for (const day of days)
      await execute('INSERT INTO activity_allowed_days(activity_id,day) VALUES (?,?)', [a, day]);
  }
}
export async function prepareSchedules(
  agent: any,
  period: number,
  activity: number | string,
  slots: any[],
): Promise<{ ids?: number[]; error?: any }> {
  const catalog = (await agent.get('/api/activities')).body;
  const a = catalog.find((a: any) =>
    typeof activity === 'number' ? a.id === activity : a.name === activity,
  );
  let offers = (await agent.get(`/api/offerings?period_id=${period}`)).body;
  let o = offers.find((o: any) => o.activity_id === a.id);
  if (!o) {
    const r = await agent
      .post('/api/offerings')
      .send({ period_id: period, activity_id: a.id, mode: a.mode, days: a.days });
    if (r.status !== 201) return { error: r };
    offers = (await agent.get(`/api/offerings?period_id=${period}`)).body;
    o = offers.find((o: any) => o.activity_id === a.id);
  }
  const teachers = (await agent.get('/api/instructors')).body;
  const teacher = teachers.find((i: any) => i.name === configs.find((c) => c[0] === a.name)?.[1]);
  const ids = [];
  for (const slot of slots) {
    let h = o.schedules.find(
      (h: any) => h.day === slot.day && h.start === slot.start && h.end === slot.end,
    );
    if (!h) {
      const r = await agent
        .post('/api/schedules')
        .send({ ...slot, offering_id: o.id, instructor_ids: teacher ? [teacher.id] : [] });
      if (r.status !== 201) return { error: r };
      h = { id: r.body.id };
    }
    ids.push(h.id);
  }
  return { ids };
}
export async function incorporateTestPerson(agent: any, person: number, period: number) {
  const current = await agent.get(`/api/periods/${period}/memberships?person_id=${person}`);
  if (current.status === 200 && current.body.length) return;
  const result = await agent.post(`/api/periods/${period}/memberships`).send({ person_id: person });
  if (result.status !== 201) throw new Error(result.body.message);
}
