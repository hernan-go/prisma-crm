import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { pool, query, execute } from '../server/db';
import { migrate } from '../server/migrate';
import { disposableDatabase } from '../server/disposable-database';
import { sessionDigest } from '../server/identity';
import { mutateEducation, educationalEntitlement } from '../server/education-access';
import request from 'supertest';
import { createApp } from '../server/app';
import { periodCreate, deleteMovement } from '../server/scheduling';
import { offeringSave, scheduleSave } from '../server/offerings';
import { membershipAdd } from '../server/memberships';
import { enrollmentSave } from '../server/services';
const admin = randomUUID(),
  learner = randomUUID(),
  token = randomBytes(32).toString('hex');
let rev = 0;
let pilot: unknown;
let yogaEnrollment: number;
const operationalBaseline = new Map<string, unknown>();
let yogaPeriod: number;
async function change(fields: Record<string, unknown>) {
  const result = await mutateEducation(token, {
    operationId: randomUUID(),
    expectedRevision: rev,
    reason: 'Synthetic QA',
    ...fields,
    ...(fields.kind === 'presential' && fields.enabled
      ? { enrollmentId: fields.enrollmentId ?? yogaEnrollment }
      : {}),
  });
  rev = result.revision;
  return result;
}
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('education isolated MySQL', () => {
  beforeAll(async () => {
    expect(process.env.DB_NAME).toBe(disposableDatabase());
    expect((await query('SHOW TABLES')).length).toBe(1);
    await migrate('022.sql');
    await execute('CREATE TABLE education_state (id INT)');
    await expect(migrate('023.sql')).rejects.toThrow('parcial');
    await execute('DROP TABLE education_state');
    await migrate('023.sql');
    await migrate('023.sql');
    expect((await query("SELECT name FROM schema_migrations WHERE name='023.sql'")).length).toBe(1);
    for (const u of [admin, learner])
      await execute(
        "INSERT INTO identity_users(id,display_name,status) VALUES (?,'Synthetic','enabled')",
        [u],
      );
    await execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'admin')", [admin]);
    await execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'participant')", [
      learner,
    ]);
    await execute(
      "INSERT INTO identity_external_accounts(provider,subject,user_id) VALUES ('google','synthetic-admin',?)",
      [admin],
    );
    await execute('UPDATE identity_institution SET initialized=1,admin_one=? WHERE id=1', [admin]);
    await execute(
      "INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at) VALUES (?,?,'crm',0,?)",
      [sessionDigest(token), admin, Date.now() + 3600000],
    );
    await execute(
      "INSERT INTO people(id,nombre,apellido,telefono,phone_normalized,direccion,observaciones,emergency_name,emergency_relationship,emergency_phone,emergency_notes) VALUES (1,'Synthetic','Learner','','','','','','','','')",
    );
    await execute(
      "INSERT INTO activities(id,name,mode) VALUES (1,'Yoga QA','group'),(2,'Digital QA','group'),(3,'Other QA','group')",
    );
    pilot = await query('SELECT * FROM portal_access_state');
    const period = await periodCreate({ year: 2030, month: 11 });
    yogaPeriod = period.id;
    const offer = await offeringSave({
      period_id: period.id,
      activity_id: 1,
      mode: 'group',
      days: [1],
    });
    const slot = await scheduleSave({
      offering_id: offer.id,
      day: 1,
      start: '10:00',
      end: '11:00',
      instructor_ids: [],
    });
    await membershipAdd(1, period.id);
    yogaEnrollment = (
      await enrollmentSave({
        person_id: 1,
        period_id: period.id,
        activity_id: 1,
        schedule_ids: [slot.id],
      })
    ).id!;
    for (const table of ['enrollments', 'periods', 'monthly_accounts', 'identity_instructor_links'])
      operationalBaseline.set(table, await query('SELECT * FROM ' + table));
  });
  afterAll(async () => {
    await pool.end();
  });
  it('binds explicitly; denies ambiguity and missing admin', async () => {
    await expect(
      mutateEducation('bad', {
        kind: 'link',
        operationId: randomUUID(),
        expectedRevision: rev,
        reason: 'QA',
        userId: learner,
        personId: 1,
        enabled: true,
      }),
    ).rejects.toThrow();
    await change({ kind: 'link', userId: learner, personId: 1, enabled: true });
    await expect(
      change({ kind: 'link', userId: admin, personId: 1, enabled: true }),
    ).rejects.toThrow('incompatible');
    expect(await educationalEntitlement(learner, 1)).toBe(false);
  });
  it('Yoga persists when digital expires; exact time enforced without cron', async () => {
    await change({ kind: 'presential', personId: 1, activityId: 1, enabled: true });
    const digital = await change({
      kind: 'digital',
      personId: 1,
      activityId: 2,
      paymentVerified: true,
      verificationReference: 'first',
    });
    expect(await educationalEntitlement(learner, 1)).toBe(true);
    expect(await educationalEntitlement(learner, 2)).toBe(true);
    expect(await educationalEntitlement(learner, 3)).toBe(false);
    await execute('UPDATE education_digital_rights SET starts_at=0,ends_at=1 WHERE id=?', [
      digital.rightId,
    ]);
    expect(await educationalEntitlement(learner, 2)).toBe(false);
    expect(await educationalEntitlement(learner, 1)).toBe(true);
    expect((await query('SELECT id FROM identity_users WHERE id=?', [learner])).length).toBe(1);
  });
  it('sources revoked independently and renewed without duplicated payment', async () => {
    const digital = await change({
      kind: 'digital',
      personId: 1,
      activityId: 1,
      paymentVerified: true,
      verificationReference: 'second',
    });
    await change({ kind: 'presential', personId: 1, activityId: 1, enabled: false });
    expect(await educationalEntitlement(learner, 1)).toBe(true);
    const renewal = await change({
      kind: 'digital',
      personId: 1,
      activityId: 1,
      paymentVerified: true,
      verificationReference: 'third',
    });
    expect(renewal.startsAt).toBe(digital.endsAt);
    await change({ kind: 'revoke', rightId: digital.rightId });
    expect(await educationalEntitlement(learner, 1)).toBe(false);
    await change({ kind: 'presential', personId: 1, activityId: 1, enabled: true });
    await change({ kind: 'revoke', rightId: renewal.rightId });
    expect(await educationalEntitlement(learner, 1)).toBe(true);
    await change({ kind: 'presential', personId: 1, activityId: 1, enabled: false });
    expect(await educationalEntitlement(learner, 1)).toBe(false);
    await expect(
      change({
        kind: 'digital',
        personId: 1,
        activityId: 1,
        paymentVerified: true,
        verificationReference: 'second',
      }),
    ).rejects.toThrow('utilizada');
  });
  it('serializes duplicate requests and rejects stale competing renewals', async () => {
    const input = {
      kind: 'digital',
      personId: 1,
      activityId: 2,
      paymentVerified: true,
      verificationReference: 'concurrent',
      operationId: randomUUID(),
      expectedRevision: rev,
      reason: 'QA',
    };
    const results = await Promise.all([
      mutateEducation(token, input),
      mutateEducation(token, input),
    ]);
    expect(results[0]).toEqual(results[1]);
    rev = results[0].revision;
    expect(
      (
        await query('SELECT id FROM education_digital_rights WHERE verification_reference=?', [
          'concurrent',
        ])
      ).length,
    ).toBe(1);
    const calls = ['x', 'y'].map((ref) =>
      mutateEducation(token, {
        ...input,
        operationId: randomUUID(),
        expectedRevision: rev,
        verificationReference: ref,
      }),
    );
    const outcomes = await Promise.allSettled(calls);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    rev++;
  });
  it('rolls back state/grant when audit fails; preserves pilot and operational tables', async () => {
    const rejectedOperation = randomUUID();
    // Schema-local CHECK needs no global trigger/binlog privilege in the CI service.
    await pool.query(
      `ALTER TABLE education_operations ADD CONSTRAINT qa_audit_reject CHECK (operation_id <> '${rejectedOperation}')`,
    );
    await expect(
      change({
        kind: 'digital',
        personId: 1,
        activityId: 3,
        paymentVerified: true,
        verificationReference: 'rollback',
        operationId: rejectedOperation,
      }),
    ).rejects.toThrow();
    expect((await query('SELECT revision FROM education_state'))[0].revision).toBe(rev);
    expect(
      (
        await query(
          "SELECT id FROM education_digital_rights WHERE verification_reference='rollback'",
        )
      ).length,
    ).toBe(0);
    await pool.query('ALTER TABLE education_operations DROP CHECK qa_audit_reject');
    expect(await query('SELECT * FROM portal_access_state')).toEqual(pilot);
    for (const table of ['enrollments', 'periods', 'monthly_accounts', 'identity_instructor_links'])
      expect(await query('SELECT * FROM ' + table)).toEqual(operationalBaseline.get(table));
  });
  it('administrative HTTP: preview, grant, replay, renewal, receipts and selective revocation', async () => {
    const secondAdmin = randomUUID();
    await execute(
      "INSERT INTO identity_users(id,display_name,status) VALUES (?,'Second synthetic admin','enabled')",
      [secondAdmin],
    );
    await execute('UPDATE identity_institution SET admin_two=? WHERE id=1', [secondAdmin]);
    const app = createApp({ identityEnabled: true, hash: '', secret: '' }, {}, {}, false, false);
    const get = (path: string) =>
      request(app)
        .get('/api/education-access' + path)
        .set('Cookie', `prisma_identity=${token}`);
    const post = (path: string, body: Record<string, unknown>) =>
      request(app)
        .post('/api/education-access' + path)
        .set('Cookie', `prisma_identity=${token}`)
        .send(body);
    expect((await get('/people?q=Synthetic')).status).toBe(200);
    expect((await get('/people/999999')).status).toBe(404);
    // A genuine synthetic CRM registration, created explicitly through its services.
    // Digital operations must preserve it, its slot and its monthly account byte for byte.
    const period = await periodCreate({ year: 2031, month: 2, mode: 'empty' });
    const offering = await offeringSave({
      period_id: period.id,
      activity_id: 1,
      mode: 'group',
      days: [1],
    });
    const schedule = await scheduleSave({
      offering_id: offering.id,
      day: 1,
      start: '10:00',
      end: '11:00',
      instructor_ids: [],
    });
    await membershipAdd(1, period.id);
    await enrollmentSave({
      person_id: 1,
      period_id: period.id,
      activity_id: 1,
      schedule_ids: [schedule.id],
    });
    const operationalTables = [
      'periods',
      'period_memberships',
      'enrollments',
      'enrollment_slots',
      'monthly_accounts',
      'payments',
    ];
    const operationalBefore = new Map<string, unknown>();
    for (const table of operationalTables)
      operationalBefore.set(table, await query('SELECT * FROM ' + table));
    await change({ kind: 'presential', personId: 1, activityId: 1, enabled: true });
    const preview = await post('/preview', { personId: 1, activityId: 2 });
    expect(preview.status).toBe(200);
    const body = {
      kind: 'digital',
      operationId: randomUUID(),
      expectedRevision: preview.body.revision,
      personId: 1,
      activityId: 2,
      paymentVerified: true,
      verificationReference: 'http-grant',
      reason: 'Manual synthetic payment',
      expectedWindow: preview.body.expectedWindow,
    };
    const grants = await Promise.all([post('/operations', body), post('/operations', body)]);
    expect(grants.map((r) => r.status)).toEqual([200, 200]);
    expect(grants[0].body).toEqual(grants[1].body);
    rev = grants[0].body.revision;
    expect((await get('/operations/' + body.operationId)).body).toMatchObject({
      actorId: admin,
      paymentDeclared: true,
      accountedPayment: false,
      result: grants[0].body,
    });
    expect(JSON.stringify((await get('/operations/' + body.operationId)).body)).not.toContain(
      sessionDigest(token),
    );
    const next = (await post('/preview', { personId: 1, activityId: 2 })).body;
    expect(next.startsAt).toBe(grants[0].body.endsAt);
    const competing = await Promise.all(
      ['http-renew-a', 'http-renew-b'].map((reference) =>
        post('/operations', {
          ...body,
          operationId: randomUUID(),
          expectedRevision: rev,
          verificationReference: reference,
          expectedWindow: next.expectedWindow,
        }),
      ),
    );
    expect(competing.map((r) => r.status).sort()).toEqual([200, 409]);
    rev++;
    const revoke = {
      kind: 'revoke',
      operationId: randomUUID(),
      expectedRevision: rev,
      rightId: grants[0].body.rightId,
      reason: 'Selective digital revocation',
    };
    expect((await post('/operations', revoke)).status).toBe(200);
    rev++;
    const state = (await get('/people/1')).body;
    expect(state.rights.find((r: any) => r.id === revoke.rightId).status).toBe('revoked');
    expect(state.enrollments).toContainEqual({ activity: 'Yoga QA', year: 2031, month: 2 });
    expect(await educationalEntitlement(learner, 1)).toBe(true);
    const sameDiscipline = (await post('/preview', { personId: 1, activityId: 1 })).body;
    const same = await post('/operations', {
      ...body,
      operationId: randomUUID(),
      expectedRevision: rev,
      activityId: 1,
      verificationReference: 'http-same-discipline',
      expectedWindow: sameDiscipline.expectedWindow,
    });
    expect(same.status).toBe(200);
    rev++;
    expect(
      (
        await post('/operations', {
          ...revoke,
          operationId: randomUUID(),
          expectedRevision: rev,
          rightId: same.body.rightId,
        })
      ).status,
    ).toBe(200);
    rev++;
    expect(await educationalEntitlement(learner, 1)).toBe(true);
    expect(
      (await get('/people/1/history')).body.rows.some(
        (r: any) => r.operationId === revoke.operationId && r.actorId === admin,
      ),
    ).toBe(true);
    expect(await query('SELECT * FROM portal_access_state')).toEqual(pilot);
    for (const table of operationalTables)
      expect(await query('SELECT * FROM ' + table)).toEqual(operationalBefore.get(table));
    await execute('UPDATE identity_sessions SET revoked_at=1 WHERE token_hash=?', [
      sessionDigest(token),
    ]);
    expect((await get('/people/1')).status).toBe(401);
  });
  it('supervises participant associations without issuing sessions; rejects ambiguity, reassignment and audit failure', async () => {
    await execute('UPDATE identity_sessions SET revoked_at=NULL WHERE token_hash=?', [
      sessionDigest(token),
    ]);
    const app = createApp({ identityEnabled: true, hash: '', secret: '' }, {}, {}, false, false);
    const post = (body: Record<string, unknown>) =>
      request(app)
        .post('/api/education-access/operations')
        .set('Cookie', `prisma_identity=${token}`)
        .send(body);
    const ids = [randomUUID(), randomUUID()];
    for (const user of ids) {
      await execute(
        "INSERT INTO identity_users(id,display_name,status) VALUES (?,'Ambiguous synthetic name','disabled')",
        [user],
      );
      await execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'participant')", [
        user,
      ]);
    }
    for (const id of [2, 3])
      await execute(
        "INSERT INTO people(id,nombre,apellido,telefono,phone_normalized,direccion,observaciones,emergency_name,emergency_relationship,emergency_phone,emergency_notes) VALUES (?,'Other','Synthetic','','','','','','','','')",
        [id],
      );
    const sessions = await query('SELECT * FROM identity_sessions');
    const candidates = await request(app)
      .get('/api/education-access/identities?q=Ambiguous')
      .set('Cookie', `prisma_identity=${token}`);
    expect(candidates.status).toBe(200);
    expect(candidates.body).toHaveLength(2);
    expect(new Set(candidates.body.map((c: any) => c.userId)).size).toBe(2);
    const command = {
      kind: 'link',
      userId: ids[0],
      personId: 2,
      enabled: true,
      associationConfirmed: true,
      operationId: randomUUID(),
      expectedRevision: rev,
      reason: 'Administrative preparation, not ownership proof',
    };
    const results = await Promise.all([post(command), post(command)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body).toEqual(results[1].body);
    rev++;
    expect(await educationalEntitlement(ids[0], 1)).toBe(false);
    for (const fields of [{ userId: ids[1] }, { personId: 3 }])
      expect(
        (await post({ ...command, ...fields, operationId: randomUUID(), expectedRevision: rev }))
          .status,
      ).toBe(409);
    const disabled = await post({
      ...command,
      enabled: false,
      operationId: randomUUID(),
      expectedRevision: rev,
    });
    expect(disabled.status).toBe(200);
    expect(disabled.body.previousEnabled).toBe(true);
    rev++;
    expect(
      (await post({ ...command, personId: 3, operationId: randomUUID(), expectedRevision: rev }))
        .status,
    ).toBe(409);
    const rejected = randomUUID();
    await pool.query(
      `ALTER TABLE education_operations ADD CONSTRAINT qa_link_audit CHECK (operation_id <> '${rejected}')`,
    );
    expect(
      (
        await post({
          ...command,
          userId: ids[1],
          personId: 3,
          operationId: rejected,
          expectedRevision: rev,
        })
      ).status,
    ).toBe(500);
    expect(await query('SELECT * FROM education_person_links WHERE person_id=3')).toHaveLength(0);
    expect((await query('SELECT revision FROM education_state'))[0].revision).toBe(rev);
    await pool.query('ALTER TABLE education_operations DROP CHECK qa_link_audit');
    expect(await query('SELECT * FROM identity_sessions')).toEqual(sessions);
    expect(await query('SELECT * FROM portal_access_state')).toEqual(pilot);
  });
  it('ties explicit presential enablement to real enrollment; monthly cancellation preserves continuity and digital survives withdrawal', async () => {
    const app = createApp({ identityEnabled: true, hash: '', secret: '' }, {}, {}, false, false);
    const post = (body: Record<string, unknown>) =>
      request(app)
        .post('/api/education-access/operations')
        .set('Cookie', `prisma_identity=${token}`)
        .send(body);
    const command = {
      kind: 'presential',
      personId: 1,
      activityId: 1,
      enabled: true,
      enrollmentId: yogaEnrollment,
      operationId: randomUUID(),
      expectedRevision: rev,
      reason: 'Explicit CRM enrollment confirmation',
    };
    for (const fields of [{ personId: 2 }, { activityId: 2 }, { enrollmentId: 999999 }])
      expect((await post({ ...command, ...fields })).status).toBe(409);
    const digital = await change({
      kind: 'digital',
      personId: 1,
      activityId: 1,
      paymentVerified: true,
      verificationReference: 'binding-digital-yoga',
    });
    await deleteMovement('enrollments', yogaEnrollment, yogaPeriod);
    expect(
      (
        await query('SELECT enabled FROM education_presential WHERE person_id=1 AND activity_id=1')
      )[0].enabled,
    ).toBe(1);
    expect(
      (await post({ ...command, operationId: randomUUID(), expectedRevision: rev })).status,
    ).toBe(409);
    const withdrawn = await post({
      ...command,
      operationId: randomUUID(),
      expectedRevision: rev,
      enabled: false,
      enrollmentId: undefined,
    });
    expect(withdrawn.status).toBe(200);
    rev++;
    expect(await educationalEntitlement(learner, 1)).toBe(true);
    await change({ kind: 'revoke', rightId: digital.rightId });
    expect(await educationalEntitlement(learner, 1)).toBe(false);
    await change({ kind: 'link', userId: learner, personId: 1, enabled: false });
    expect(await educationalEntitlement(learner, 2)).toBe(false);
    await change({ kind: 'link', userId: learner, personId: 1, enabled: true });
    await execute("DELETE FROM identity_user_roles WHERE user_id=? AND role='participant'", [
      learner,
    ]);
    expect(await educationalEntitlement(learner, 2)).toBe(false);
    await execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'participant')", [
      learner,
    ]);
    expect(await query('SELECT * FROM portal_access_state')).toEqual(pilot);
  });

  it.each(['digital', 'expired', 'revoked', 'presential-enabled', 'presential-disabled'])(
    'rejects activity deletion with %s references and preserves all educational data and allowed days',
    async (source) => {
      const activity = (
        await execute("INSERT INTO activities(name,mode) VALUES (?,'group')", [
          `Deletion QA ${source}`,
        ])
      ).insertId;
      await execute('INSERT INTO activity_allowed_days(activity_id,day) VALUES (?,1)', [activity]);
      if (source.startsWith('presential')) {
        // Persisted FK fixture, independent of the enrollment/entitlement service scenarios.
        await execute(
          'INSERT INTO education_presential(person_id,activity_id,enabled) VALUES (1,?,?)',
          [activity, source === 'presential-enabled' ? 1 : 0],
        );
      } else {
        const right = await change({
          kind: 'digital',
          personId: 1,
          activityId: activity,
          paymentVerified: true,
          verificationReference: `deletion-${source}`,
        });
        if (source === 'expired')
          await execute('UPDATE education_digital_rights SET starts_at=1,ends_at=2 WHERE id=?', [
            right.rightId,
          ]);
        if (source === 'revoked') await change({ kind: 'revoke', rightId: right.rightId });
      }
      const snapshot = async () => {
        const result: Record<string, unknown> = {};
        for (const [table, order] of [
          ['activities', 'id'],
          ['activity_allowed_days', 'activity_id,day'],
          ['education_state', 'id'],
          ['education_person_links', 'user_id'],
          ['education_presential', 'person_id,activity_id'],
          ['education_digital_rights', 'id'],
          ['education_operations', 'operation_id'],
        ])
          result[table] = await query(`SELECT * FROM ${table} ORDER BY ${order}`);
        return result;
      };
      const before = await snapshot();
      const app = createApp({ identityEnabled: true, hash: '', secret: '' }, {}, {}, false, false);
      const response = await request(app)
        .delete(`/api/activities/${activity}`)
        .set('Cookie', `prisma_identity=${token}`);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/archiv/i);
      expect(JSON.stringify(response.body)).not.toMatch(/SQL|ER_ROW|education_/);
      expect(await snapshot()).toEqual(before);
    },
  );

  it('deletes an activity without dependencies while preserving educational history', async () => {
    const activity = (
      await execute("INSERT INTO activities(name,mode) VALUES ('Deletion QA empty','group')")
    ).insertId;
    await execute('INSERT INTO activity_allowed_days(activity_id,day) VALUES (?,1)', [activity]);
    const before = await query('SELECT * FROM education_operations ORDER BY operation_id');
    const app = createApp({ identityEnabled: true, hash: '', secret: '' }, {}, {}, false, false);
    expect(
      (
        await request(app)
          .delete(`/api/activities/${activity}`)
          .set('Cookie', `prisma_identity=${token}`)
      ).status,
    ).toBe(200);
    expect(await query('SELECT id FROM activities WHERE id=?', [activity])).toEqual([]);
    expect(
      await query('SELECT * FROM activity_allowed_days WHERE activity_id=?', [activity]),
    ).toEqual([]);
    expect(await query('SELECT * FROM education_operations ORDER BY operation_id')).toEqual(before);
  });
});
