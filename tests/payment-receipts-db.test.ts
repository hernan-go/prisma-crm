import { testCredentials, memorySessions } from './auth-helper';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { pool, query, execute, peopleTransaction } from '../server/db';
import { migrate } from '../server/migrate';
import { sessionDigest } from '../server/identity';
import { disposableDatabase } from '../server/disposable-database';
import {
  mutatePaymentReceipt,
  previewPaymentReceipt,
  readPaymentReceipts,
} from '../server/payment-receipts';
import { paymentSave, enrollmentSave } from '../server/services';
import { membershipAdd, membershipRemove } from '../server/memberships';
import { periodCreate, deleteMovement } from '../server/scheduling';
import { offeringSave, scheduleSave } from '../server/offerings';
import { createApp } from '../server/app';
import type { ReceiptFinancialContext } from '../server/receipt-financial-guard';
import type { PaymentReceipt } from '../shared/payment-receipts';

const tokens = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex')];
const admins = [randomUUID(), randomUUID()];
let period: number, slot: number;
let portal: unknown;
function correction(token = tokens[0]): ReceiptFinancialContext {
  return { token, operationId: randomUUID(), reason: 'Synthetic correction' };
}
async function fixture(amountDue: string | null = '100.00') {
  const person = (
    await execute(
      "INSERT INTO people(nombre,apellido,telefono,phone_normalized,direccion,observaciones,emergency_name,emergency_relationship,emergency_phone,emergency_notes) VALUES ('Synthetic','Receipt','','','','private note must not appear','','','','')",
    )
  ).insertId;
  const membership = await membershipAdd(person, period);
  const pay = {
    person_id: person,
    period_id: period,
    date: '2031-11-15',
    amount: '60.25',
    method: 'cash',
    recipient: 'jesica',
    notes: 'private payment note',
  };
  const payment = (await paymentSave(pay)).id!;
  await execute('UPDATE monthly_accounts SET amount_due=? WHERE person_id=? AND period_id=?', [
    amountDue,
    person,
    period,
  ]);
  const [account] = await query<{ id: number }>(
    'SELECT id FROM monthly_accounts WHERE person_id=? AND period_id=?',
    [person, period],
  );
  return { person, payment, membership: membership.id, account: account.id, pay };
}
async function issue(paymentId: number, token = tokens[0], extra: Record<string, unknown> = {}) {
  const p = await previewPaymentReceipt(token, { paymentId, ...extra });
  const command = {
    kind: 'issue',
    operationId: randomUUID(),
    paymentId,
    observation: '',
    ...extra,
    previewToken: p.previewToken,
  };
  return { receipt: await mutatePaymentReceipt(token, command), command };
}
async function voidReceipt(receipt: PaymentReceipt) {
  return mutatePaymentReceipt(tokens[0], {
    kind: 'void',
    operationId: randomUUID(),
    receiptNumber: receipt.number,
    reason: 'Synthetic void',
  });
}
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('payment receipts isolated MySQL', () => {
  beforeAll(async () => {
    expect(process.env.DB_NAME).toBe(disposableDatabase());
    expect((await query('SHOW TABLES')).length).toBe(1);
    process.env.RECEIPT_PREVIEW_SECRET = randomBytes(32).toString('hex');
    await migrate('023.sql');
    await execute('CREATE TABLE payment_receipts (id INT)');
    await expect(migrate('024.sql')).rejects.toThrow('parcial');
    await execute('DROP TABLE payment_receipts');
    await migrate('024.sql');
    await migrate('024.sql');
    expect((await query("SELECT name FROM schema_migrations WHERE name='024.sql'")).length).toBe(1);
    for (let i = 0; i < admins.length; i++) {
      await execute(
        "INSERT INTO identity_users(id,display_name,status) VALUES (?,'Synthetic administrator','enabled')",
        [admins[i]],
      );
      await execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'admin')", [
        admins[i],
      ]);
      await execute(
        "INSERT INTO identity_external_accounts(provider,subject,user_id) VALUES ('google',?,?)",
        ['synthetic-' + i, admins[i]],
      );
      await execute(
        "INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at) VALUES (?,?,'crm',0,?)",
        [sessionDigest(tokens[i]), admins[i], Date.now() + 3600000],
      );
    }
    await execute(
      'UPDATE identity_institution SET initialized=1,admin_one=?,admin_two=? WHERE id=1',
      admins,
    );
    portal = await query('SELECT * FROM portal_access_state');
    period = (await periodCreate({ year: 2031, month: 11 })).id;
    const activity = (
      await execute(
        "INSERT INTO activities(name,mode) VALUES ('Receipt synthetic activity','group')",
      )
    ).insertId;
    const offer = await offeringSave({
      period_id: period,
      activity_id: activity,
      mode: 'group',
      days: [1],
    });
    slot = (
      await scheduleSave({
        offering_id: offer.id,
        day: 1,
        start: '10:00',
        end: '11:00',
        instructor_ids: [],
      })
    ).id;
  });
  afterAll(async () => {
    await pool.end();
  });
  it('previews without writes; emits exact immutable snapshot and recovers a committed response', async () => {
    const f = await fixture();
    const p = await previewPaymentReceipt(tokens[0], { paymentId: f.payment });
    expect(p.snapshot).toMatchObject({
      amount: '60.25',
      obligation: '100.00',
      accumulated: '60.25',
      balance: '39.75',
      period: { year: 2031, month: 11 },
      paymentDate: '2031-11-15',
      resources: { profile: 'generic' },
    });
    expect(JSON.stringify(p)).not.toContain('private');
    expect(
      await query('SELECT number FROM payment_receipts WHERE original_payment_id=?', [f.payment]),
    ).toEqual([]);
    const command = {
      kind: 'issue',
      operationId: randomUUID(),
      paymentId: f.payment,
      previewToken: p.previewToken,
    };
    const receipt = await mutatePaymentReceipt(tokens[0], command);
    expect(receipt.status).toBe('active');
    expect(await mutatePaymentReceipt(tokens[0], command)).toEqual(receipt);
    await expect(mutatePaymentReceipt(tokens[1], command)).rejects.toMatchObject({ status: 409 });
    await expect(
      mutatePaymentReceipt(tokens[0], { ...command, observation: 'changed' }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      execute('UPDATE payment_receipts SET snapshot_json=JSON_OBJECT() WHERE number=?', [
        receipt.number,
      ]),
    ).rejects.toThrow();
    await expect(
      execute('DELETE FROM payment_receipts WHERE number=?', [receipt.number]),
    ).rejects.toThrow();
  });
  it('protects live receipts and audits correction after void without mutating the snapshot', async () => {
    const f = await fixture();
    const { receipt } = await issue(f.payment);
    await expect(
      paymentSave({ ...f.pay, amount: '70.00' }, f.payment, correction()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(deleteMovement('payments', f.payment, period, correction())).rejects.toMatchObject(
      { status: 409 },
    );
    await voidReceipt(receipt);
    await expect(paymentSave({ ...f.pay, amount: '70.00' }, f.payment)).rejects.toMatchObject({
      status: 403,
    });
    const c = correction();
    await paymentSave({ ...f.pay, amount: '70.00' }, f.payment, c);
    expect(await paymentSave({ ...f.pay, amount: '70.00' }, f.payment, c)).toEqual({
      id: f.payment,
    });
    const historical = await readPaymentReceipts(tokens[0], { number: receipt.number });
    expect(historical).toMatchObject({ status: 'void', snapshot: { amount: '60.25' } });
    const [audit] = await query<{ evidence_json: unknown }>(
      'SELECT evidence_json FROM payment_receipt_operations WHERE operation_id=?',
      [c.operationId],
    );
    expect(JSON.stringify(audit)).toContain('60.25');
  });
  it('detaches payment/account explicitly, preserves historical identity and replays deletion', async () => {
    const f = await fixture(null);
    const { receipt } = await issue(f.payment);
    await voidReceipt(receipt);
    const c = correction();
    await deleteMovement('payments', f.payment, period, c);
    expect(await deleteMovement('payments', f.payment, period, c)).toEqual({ ok: true });
    const m = correction();
    await membershipRemove(f.membership, period, m);
    expect(await membershipRemove(f.membership, period, m)).toEqual({ ok: true });
    expect(await query('SELECT id FROM monthly_accounts WHERE id=?', [f.account])).toEqual([]);
    const [row] = await query<{ payment_id: null; account_id: null }>(
      'SELECT payment_id,account_id FROM payment_receipts WHERE number=?',
      [receipt.number],
    );
    expect(row).toEqual({ payment_id: null, account_id: null });
    await execute('UPDATE people SET activo=0 WHERE id=?', [f.person]);
    expect(await readPaymentReceipts(tokens[0], { personId: f.person })).toMatchObject({
      items: [{ number: receipt.number, snapshot: { paymentId: f.payment, accountId: f.account } }],
    });
    await execute('UPDATE people SET activo=1 WHERE id=?', [f.person]);
    await membershipAdd(f.person, period);
    expect(
      (await query('SELECT account_id FROM payment_receipts WHERE number=?', [receipt.number]))[0]
        .account_id,
    ).toBeNull();
  });
  it('retains zero obligations and enrollments as real membership blockers', async () => {
    const f = await fixture('0.00');
    const { receipt } = await issue(f.payment);
    await voidReceipt(receipt);
    await deleteMovement('payments', f.payment, period, correction());
    await expect(membershipRemove(f.membership, period, correction())).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await query('SELECT account_id FROM payment_receipts WHERE number=?', [receipt.number]))[0]
        .account_id,
    ).toBe(f.account);
  });
  it('invalidates previews after money, obligation or enrollment source changes', async () => {
    const f = await fixture();
    for (const change of [
      async () => paymentSave({ ...f.pay, amount: '60.26' }, f.payment),
      async () => execute('UPDATE monthly_accounts SET amount_due=NULL WHERE id=?', [f.account]),
      async () => {
        const [a] = await query<{ activity_id: number }>(
          'SELECT activity_id FROM period_activities WHERE period_id=?',
          [period],
        );
        await enrollmentSave({
          person_id: f.person,
          period_id: period,
          activity_id: a.activity_id,
          schedule_ids: [slot],
        });
      },
    ]) {
      const p = await previewPaymentReceipt(tokens[0], { paymentId: f.payment });
      await change();
      await expect(
        mutatePaymentReceipt(tokens[0], {
          kind: 'issue',
          operationId: randomUUID(),
          paymentId: f.payment,
          previewToken: p.previewToken,
        }),
      ).rejects.toMatchObject({ status: 409 });
    }
    const { receipt } = await issue(f.payment);
    expect(receipt.snapshot.activities).toHaveLength(1);
    const enrollment = receipt.snapshot.activities[0].enrollmentId;
    await deleteMovement('enrollments', enrollment, period);
    expect(
      ((await readPaymentReceipts(tokens[0], { number: receipt.number })) as PaymentReceipt)
        .snapshot.activities,
    ).toHaveLength(1);
    expect((await query('SELECT id FROM payments WHERE id=?', [f.payment])).length).toBe(1);
  });
  it('serializes two actors issuing the same payment and exposes the existing number', async () => {
    const f = await fixture();
    const previews = await Promise.all(
      tokens.map((t) => previewPaymentReceipt(t, { paymentId: f.payment })),
    );
    const results = await Promise.allSettled(
      tokens.map((t, i) =>
        mutatePaymentReceipt(t, {
          kind: 'issue',
          operationId: randomUUID(),
          paymentId: f.payment,
          previewToken: previews[i].previewToken,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r) => r.status === 'rejected');
    expect(loser?.status === 'rejected' && loser.reason.status).toBe(409);
    expect(
      (await query('SELECT number FROM payment_receipts WHERE active_payment_id=?', [f.payment]))
        .length,
    ).toBe(1);
  });
  it('substitutes atomically with a new number and linear same-person/period chain', async () => {
    const f = await fixture();
    const { receipt } = await issue(f.payment);
    const replacement = await issue(f.payment, tokens[0], { replaces: receipt.number });
    expect(BigInt(replacement.receipt.number)).toBeGreaterThan(BigInt(receipt.number));
    expect(await readPaymentReceipts(tokens[0], { number: receipt.number })).toMatchObject({
      status: 'replaced',
      replacedBy: replacement.receipt.number,
    });
    expect(replacement.receipt.replaces).toBe(receipt.number);
    await expect(
      previewPaymentReceipt(tokens[0], { paymentId: f.payment, replaces: receipt.number }),
    ).rejects.toMatchObject({ status: 409 });
    const other = await fixture();
    await expect(
      previewPaymentReceipt(tokens[0], {
        paymentId: other.payment,
        replaces: replacement.receipt.number,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rolls back number, links and state when audit persistence fails', async () => {
    const f = await fixture();
    const { receipt } = await issue(f.payment);
    const p = await previewPaymentReceipt(tokens[0], {
      paymentId: f.payment,
      replaces: receipt.number,
    });
    await pool.query(
      "CREATE TRIGGER receipt_audit_failure BEFORE INSERT ON payment_receipt_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'",
    );
    try {
      await expect(
        mutatePaymentReceipt(tokens[0], {
          kind: 'issue',
          operationId: randomUUID(),
          paymentId: f.payment,
          replaces: receipt.number,
          previewToken: p.previewToken,
        }),
      ).rejects.toThrow();
    } finally {
      await pool.query('DROP TRIGGER receipt_audit_failure');
    }
    expect(await readPaymentReceipts(tokens[0], { number: receipt.number })).toMatchObject({
      status: 'active',
      replacedBy: null,
    });
    expect(
      (await query('SELECT number FROM payment_receipts WHERE original_payment_id=?', [f.payment]))
        .length,
    ).toBe(1);
  });
  it('keeps financial aggregates exact and document writes legal in closed periods', async () => {
    const f = await fixture('0.00');
    const before = await query('SELECT SUM(amount) total FROM payments');
    await execute("UPDATE periods SET status='closed' WHERE id=?", [period]);
    try {
      const { receipt } = await issue(f.payment);
      expect(receipt.snapshot.balance).toBe('-60.25');
      await voidReceipt(receipt);
      await issue(f.payment, tokens[0], { replaces: receipt.number });
      await expect(
        paymentSave({ ...f.pay, amount: '100.00' }, f.payment, correction()),
      ).rejects.toMatchObject({ status: 409 });
      expect(await query('SELECT SUM(amount) total FROM payments')).toEqual(before);
    } finally {
      await execute("UPDATE periods SET status='open' WHERE id=?", [period]);
    }
  });
  it('denies legacy, expired, revoked and noninstitutional authority, including replay', async () => {
    const f = await fixture(null);
    const { receipt, command } = await issue(f.payment);
    expect(receipt.snapshot.balance).toBeNull();
    await expect(previewPaymentReceipt('legacy', { paymentId: f.payment })).rejects.toMatchObject({
      status: 403,
    });
    await execute('UPDATE identity_sessions SET revoked_at=1 WHERE token_hash=?', [
      sessionDigest(tokens[0]),
    ]);
    try {
      await expect(mutatePaymentReceipt(tokens[0], command)).rejects.toMatchObject({ status: 403 });
    } finally {
      await execute('UPDATE identity_sessions SET revoked_at=NULL WHERE token_hash=?', [
        sessionDigest(tokens[0]),
      ]);
    }
    await execute('UPDATE identity_institution SET admin_two=NULL WHERE id=1');
    try {
      await expect(
        readPaymentReceipts(tokens[1], { number: receipt.number }),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      await execute('UPDATE identity_institution SET admin_two=? WHERE id=1', [admins[1]]);
    }
    const app = createApp(
      { ...(await testCredentials()), store: memorySessions(), identityEnabled: true },
      {},
      {},
      false,
      false,
    );
    const response = await request(app)
      .get('/api/payment-receipts/' + receipt.number)
      .set('Cookie', 'prisma_identity=' + tokens[0]);
    expect(response.status).toBe(200);
    expect(response.body.number).toBe(receipt.number);
    expect((await request(app).get('/api/payment-receipts/' + receipt.number)).status).toBe(401);
  });
  it('leaves portal/admissions/pilot unchanged and has no retroactive issuer', async () => {
    expect(await query('SELECT * FROM portal_access_state')).toEqual(portal);
    const f = await fixture();
    expect(
      await query('SELECT number FROM payment_receipts WHERE original_payment_id=?', [f.payment]),
    ).toEqual([]);
    await peopleTransaction(async (db) => {
      const [r] = await query<{ n: number }>(
        "SELECT COUNT(*) n FROM payment_receipts WHERE status='active' AND (payment_id IS NULL OR account_id IS NULL)",
        [],
        db,
      );
      expect(Number(r.n)).toBe(0);
    });
  });
  it('serializes issue versus payment edits and deletion without orphaning a receipt', async () => {
    for (const kind of ['update', 'delete'] as const) {
      const f = await fixture();
      const p = await previewPaymentReceipt(tokens[0], { paymentId: f.payment });
      const results = await Promise.allSettled([
        mutatePaymentReceipt(tokens[0], {
          kind: 'issue',
          operationId: randomUUID(),
          paymentId: f.payment,
          previewToken: p.previewToken,
        }),
        kind === 'update'
          ? paymentSave({ ...f.pay, amount: '71.00' }, f.payment, correction())
          : deleteMovement('payments', f.payment, period, correction()),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rows = await query<{ number: string; amount: string }>(
        'SELECT CAST(r.number AS CHAR) number,p.amount FROM payment_receipts r JOIN payments p ON p.id=r.payment_id WHERE r.original_payment_id=?',
        [f.payment],
      );
      if (results[0].status === 'fulfilled') expect(rows).toMatchObject([{ amount: '60.25' }]);
      else expect(rows).toHaveLength(0);
    }
  });
  it('serializes void, substitution and deletion while preserving one linear chain', async () => {
    const f = await fixture(null);
    const { receipt } = await issue(f.payment);
    const p = await previewPaymentReceipt(tokens[0], {
      paymentId: f.payment,
      replaces: receipt.number,
    });
    const results = await Promise.allSettled([
      mutatePaymentReceipt(tokens[0], {
        kind: 'issue',
        operationId: randomUUID(),
        paymentId: f.payment,
        replaces: receipt.number,
        previewToken: p.previewToken,
      }),
      voidReceipt(receipt),
      deleteMovement('payments', f.payment, period, correction()),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const [original] = await query<{
      status: string;
      replaced_by: string | null;
      payment_id: number | null;
    }>(
      'SELECT status,CAST(replaced_by AS CHAR) replaced_by,payment_id FROM payment_receipts WHERE number=?',
      [receipt.number],
    );
    if (original.status === 'replaced') {
      expect(original.replaced_by).not.toBeNull();
      expect(
        (await query('SELECT number FROM payment_receipts WHERE active_payment_id=?', [f.payment]))
          .length,
      ).toBe(1);
    } else expect(original.status).toBe('void');
    expect(
      (
        await query(
          "SELECT number FROM payment_receipts WHERE original_payment_id=? AND status='active' AND payment_id IS NULL",
          [f.payment],
        )
      ).length,
    ).toBe(0);
  });
  it('serializes obligation and enrollment changes with emission; membership cannot disappear with payments', async () => {
    for (const kind of ['obligation', 'enrollment', 'membership'] as const) {
      const f = await fixture();
      const p = await previewPaymentReceipt(tokens[0], { paymentId: f.payment });
      const [a] = await query<{ activity_id: number }>(
        'SELECT activity_id FROM period_activities WHERE period_id=?',
        [period],
      );
      const change = () =>
        kind === 'obligation'
          ? peopleTransaction((db) =>
              execute('UPDATE monthly_accounts SET amount_due=NULL WHERE id=?', [f.account], db),
            )
          : kind === 'enrollment'
            ? enrollmentSave({
                person_id: f.person,
                period_id: period,
                activity_id: a.activity_id,
                schedule_ids: [slot],
              })
            : membershipRemove(f.membership, period, correction());
      const results = await Promise.allSettled([
        mutatePaymentReceipt(tokens[0], {
          kind: 'issue',
          operationId: randomUUID(),
          paymentId: f.payment,
          previewToken: p.previewToken,
        }),
        change(),
      ]);
      if (results[0].status === 'fulfilled')
        expect(results[0].value.snapshot).toMatchObject({ obligation: '100.00', activities: [] });
      else expect(results[0].reason.status).toBe(409);
      if (kind === 'membership') expect(results[1].status).toBe('rejected');
      expect(
        (await query('SELECT id FROM period_memberships WHERE id=?', [f.membership])).length,
      ).toBe(1);
    }
  });
  it('rolls back explicit unlinking and physical deletion together on audit failure', async () => {
    const f = await fixture(null);
    const { receipt } = await issue(f.payment);
    await voidReceipt(receipt);
    await pool.query(
      "CREATE TRIGGER receipt_unlink_failure BEFORE INSERT ON payment_receipt_operations FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic audit failure'",
    );
    try {
      await expect(deleteMovement('payments', f.payment, period, correction())).rejects.toThrow();
    } finally {
      await pool.query('DROP TRIGGER receipt_unlink_failure');
    }
    expect(
      (await query('SELECT payment_id FROM payment_receipts WHERE number=?', [receipt.number]))[0]
        .payment_id,
    ).toBe(f.payment);
    expect((await query('SELECT id FROM payments WHERE id=?', [f.payment])).length).toBe(1);
  });
  it('enforces active uniqueness, live references and immutable identity in MySQL', async () => {
    const f = await fixture();
    const { receipt } = await issue(f.payment);
    await expect(
      execute('UPDATE payment_receipts SET payment_id=NULL WHERE number=?', [receipt.number]),
    ).rejects.toThrow();
    await expect(
      execute(
        'UPDATE payment_receipts SET original_person_id=original_person_id+1 WHERE number=?',
        [receipt.number],
      ),
    ).rejects.toThrow();
    await expect(execute('DELETE FROM payments WHERE id=?', [f.payment])).rejects.toThrow();
    await expect(
      execute(
        `INSERT INTO payment_receipts(original_person_id,original_period_id,original_payment_id,original_account_id,payment_id,account_id,status,snapshot_json,actor_id)
       SELECT original_person_id,original_period_id,original_payment_id,original_account_id,payment_id,account_id,status,snapshot_json,actor_id FROM payment_receipts WHERE number=?`,
        [receipt.number],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
  it('allows only one of two simultaneous substitutions of the same predecessor', async () => {
    const f = await fixture();
    const { receipt } = await issue(f.payment);
    const previews = await Promise.all(
      tokens.map((t) =>
        previewPaymentReceipt(t, { paymentId: f.payment, replaces: receipt.number }),
      ),
    );
    const results = await Promise.allSettled(
      tokens.map((t, i) =>
        mutatePaymentReceipt(t, {
          kind: 'issue',
          operationId: randomUUID(),
          paymentId: f.payment,
          replaces: receipt.number,
          previewToken: previews[i].previewToken,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await query('SELECT number FROM payment_receipts WHERE replaces=?', [receipt.number]))
        .length,
    ).toBe(1);
  });
  it('rejects rewriting or removing an established successor', async () => {
    const f = await fixture();
    const first = await issue(f.payment);
    const second = await issue(f.payment, tokens[0], { replaces: first.receipt.number });
    const third = await issue(f.payment, tokens[0], { replaces: second.receipt.number });
    // This backward rewrite previously succeeded and formed a cycle.
    await expect(
      execute('UPDATE payment_receipts SET replaced_by=? WHERE number=?', [
        first.receipt.number,
        second.receipt.number,
      ]),
    ).rejects.toThrow();
    await expect(
      execute('UPDATE payment_receipts SET replaced_by=NULL WHERE number=?', [
        first.receipt.number,
      ]),
    ).rejects.toThrow();
    expect(await readPaymentReceipts(tokens[0], { number: second.receipt.number })).toMatchObject({
      replacedBy: third.receipt.number,
    });
  });
  it('rejects self references and nonreciprocal successors even for the same person', async () => {
    const f = await fixture();
    const first = await issue(f.payment);
    await voidReceipt(first.receipt);
    const other = await issue(f.payment);
    for (const successor of [first.receipt.number, other.receipt.number])
      await expect(
        execute("UPDATE payment_receipts SET status='replaced',replaced_by=? WHERE number=?", [
          successor,
          first.receipt.number,
        ]),
      ).rejects.toThrow();
    const stranger = await fixture();
    const foreign = await issue(stranger.payment);
    await expect(
      execute("UPDATE payment_receipts SET status='replaced',replaced_by=? WHERE number=?", [
        foreign.receipt.number,
        first.receipt.number,
      ]),
    ).rejects.toThrow();
  });
  it('rejects NULL, empty and blank reasons for void and replacement states', async () => {
    for (const reason of [null, '', '   ']) {
      const f = await fixture();
      const { receipt } = await issue(f.payment);
      await expect(
        execute(
          "UPDATE payment_receipts SET status='void',ended_at=CURRENT_TIMESTAMP(3),ended_by=?,reason=? WHERE number=?",
          [admins[0], reason, receipt.number],
        ),
      ).rejects.toThrow();
      await expect(
        execute(
          "UPDATE payment_receipts SET status='replaced',ended_at=CURRENT_TIMESTAMP(3),ended_by=?,reason=?,replaced_by=? WHERE number=?",
          [admins[0], reason, receipt.number, receipt.number],
        ),
      ).rejects.toThrow();
    }
  });

  it('rejects forged initial successor and predecessor links through direct inserts', async () => {
    const f = await fixture();
    const { receipt } = await issue(f.payment);
    await voidReceipt(receipt);
    const columns =
      'number,original_person_id,original_period_id,original_payment_id,original_account_id,payment_id,account_id,status,snapshot_json,actor_id,ended_at,ended_by,reason,replaces,replaced_by';
    const copy =
      'original_person_id,original_period_id,original_payment_id,original_account_id,payment_id,account_id';
    for (const [predecessor, successor] of [
      [null, '9000000000000'],
      ['9000000000000', null],
      [receipt.number, null],
    ]) {
      // Forged terminal states must not bypass normal insertion rules.
      const number = predecessor === receipt.number ? '0' : '9000000000000';
      await expect(
        execute(
          'INSERT INTO payment_receipts(' +
            columns +
            ') SELECT ?, ' +
            copy +
            ",'replaced',snapshot_json,actor_id,CURRENT_TIMESTAMP(3),actor_id,'Forged chain',?,? FROM payment_receipts WHERE number=?",
          [number, predecessor, successor, receipt.number],
        ),
      ).rejects.toThrow();
    }
    await expect(
      execute('UPDATE payment_receipts SET replaces=number WHERE number=?', [receipt.number]),
    ).rejects.toThrow();
  });
});
