import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { pool, query, execute } from '../server/db';
import { migrate } from '../server/migrate';
import { disposableDatabase } from '../server/disposable-database';
import { sessionDigest } from '../server/identity';
import { mutateEducation, educationalEntitlement } from '../server/education-access';
const admin = randomUUID(),
  learner = randomUUID(),
  token = randomBytes(32).toString('hex');
let rev = 0;
let pilot: unknown;
async function change(fields: Record<string, unknown>) {
  const result = await mutateEducation(token, {
    operationId: randomUUID(),
    expectedRevision: rev,
    reason: 'Synthetic QA',
    ...fields,
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
    await pool.query(
      "CREATE TRIGGER qa_audit_reject BEFORE INSERT ON education_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit rejection'",
    );
    await expect(
      change({
        kind: 'digital',
        personId: 1,
        activityId: 3,
        paymentVerified: true,
        verificationReference: 'rollback',
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
    await pool.query('DROP TRIGGER qa_audit_reject');
    expect(await query('SELECT * FROM portal_access_state')).toEqual(pilot);
    for (const table of ['enrollments', 'periods', 'monthly_accounts', 'identity_instructor_links'])
      expect((await query('SELECT * FROM ' + table)).length).toBe(0);
  });
});
