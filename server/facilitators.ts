import { Router } from 'express';
import { Decimal } from 'decimal.js';
import { query, execute, peopleTransaction, type Connection } from './db.js';
import { openPeriod } from './scheduling.js';
import { AppError, requireFound } from './errors.js';
import { positiveId } from './services.js';
import {
  facilitatorAccountSchema,
  facilitatorPaymentSchema,
  facilitatorPending,
} from '../shared/facilitators.js';

export async function facilitatorAccounts(period: number) {
  requireFound((await query('SELECT id FROM periods WHERE id=?', [period]))[0]);
  const rows = await query(
    `SELECT c.id,o.id offering_id,i.id instructor_id,
    COALESCE(assignments.display_name,CONCAT_WS(' ',i.name,NULLIF(i.surname,''))) instructor,
    o.name activity,c.amount_due,COALESCE(c.notes,'') notes,
    COALESCE(p.paid,0) paid,IF(assignments.instructor_id IS NULL,0,1) assigned
    FROM (
      SELECT s.offering_id,si.instructor_id FROM activity_schedules s
      JOIN schedule_instructors si ON si.schedule_id=s.id
      UNION SELECT offering_id,instructor_id FROM facilitator_accounts
    ) pairs JOIN period_activities o ON o.id=pairs.offering_id
    JOIN instructors i ON i.id=pairs.instructor_id
    LEFT JOIN facilitator_accounts c ON c.offering_id=o.id AND c.instructor_id=i.id
    LEFT JOIN (SELECT s.offering_id,si.instructor_id,MIN(si.display_name) display_name
      FROM activity_schedules s JOIN schedule_instructors si ON si.schedule_id=s.id
      GROUP BY s.offering_id,si.instructor_id) assignments
      ON assignments.offering_id=o.id AND assignments.instructor_id=i.id
    LEFT JOIN (SELECT account_id,SUM(amount) paid FROM facilitator_payments GROUP BY account_id) p ON p.account_id=c.id
    WHERE o.period_id=? ORDER BY instructor,i.id,o.name,o.id`,
    [period],
  );
  return rows.map((r) => ({
    ...r,
    paid: new Decimal(r.paid).toFixed(2),
    pending: facilitatorPending(r.amount_due, r.paid),
  }));
}
async function lockAccount(accountId: number, db: Connection) {
  const [ref] = await query(
    'SELECT o.period_id FROM facilitator_accounts c JOIN period_activities o ON o.id=c.offering_id WHERE c.id=?',
    [accountId],
    db,
  );
  requireFound(ref);
  await openPeriod(ref.period_id, db);
  const [account] = await query(
    'SELECT * FROM facilitator_accounts WHERE id=? FOR UPDATE',
    [accountId],
    db,
  );
  requireFound(account);
  return account;
}
async function saveAccount(body: unknown) {
  const p = facilitatorAccountSchema.parse(body);
  return peopleTransaction(async (db) => {
    const [o] = await query(
      'SELECT period_id FROM period_activities WHERE id=?',
      [p.offering_id],
      db,
    );
    requireFound(o);
    await openPeriod(o.period_id, db);
    const [old] = await query(
      'SELECT id FROM facilitator_accounts WHERE offering_id=? AND instructor_id=? FOR UPDATE',
      [p.offering_id, p.instructor_id],
      db,
    );
    if (!old) {
      const [assignment] = await query(
        'SELECT si.instructor_id FROM schedule_instructors si JOIN activity_schedules s ON s.id=si.schedule_id WHERE s.offering_id=? AND si.instructor_id=? LIMIT 1',
        [p.offering_id, p.instructor_id],
        db,
      );
      if (!assignment)
        throw new AppError(409, 'El facilitador debe estar asignado en Configuración → Período.');
    }
    await execute(
      'INSERT INTO facilitator_accounts(offering_id,instructor_id,amount_due,notes) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE amount_due=VALUES(amount_due),notes=VALUES(notes)',
      [p.offering_id, p.instructor_id, p.amount_due, p.notes],
      db,
    );
    await execute('UPDATE instructors SET ever_used=1 WHERE id=?', [p.instructor_id], db);
    const [account] = await query(
      'SELECT id FROM facilitator_accounts WHERE offering_id=? AND instructor_id=?',
      [p.offering_id, p.instructor_id],
      db,
    );
    return { id: account.id };
  });
}
async function savePayment(accountId: number, body: unknown, paymentId?: number) {
  const p = facilitatorPaymentSchema.parse(body);
  return peopleTransaction(async (db) => {
    const account = await lockAccount(accountId, db);
    if (paymentId)
      requireFound(
        (
          await query(
            'SELECT id FROM facilitator_payments WHERE id=? AND account_id=? FOR UPDATE',
            [paymentId, accountId],
            db,
          )
        )[0],
      );
    if (account.amount_due === null)
      throw new AppError(409, 'Definí el importe a pagar antes de registrar pagos.');
    const [total] = await query(
      'SELECT COALESCE(SUM(amount),0) paid FROM facilitator_payments WHERE account_id=? AND id<>?',
      [accountId, paymentId || 0],
      db,
    );
    if (new Decimal(total.paid).plus(p.amount).gt(account.amount_due))
      throw new AppError(409, 'La suma de pagos supera el importe a pagar.');
    if (paymentId)
      await execute(
        'UPDATE facilitator_payments SET date=?,amount=?,notes=? WHERE id=? AND account_id=?',
        [p.date, p.amount, p.notes, paymentId, accountId],
        db,
      );
    else
      paymentId = (
        await execute(
          'INSERT INTO facilitator_payments(account_id,date,amount,notes) VALUES (?,?,?,?)',
          [accountId, p.date, p.amount, p.notes],
          db,
        )
      ).insertId;
    return { id: paymentId };
  });
}
const id = (value: unknown) => positiveId.parse(value);
export const facilitators = Router();
facilitators.get('/facilitator-accounts', async (req, res) =>
  res.json(await facilitatorAccounts(id(req.query.period_id))),
);
facilitators.put('/facilitator-accounts', async (req, res) =>
  res.json(await saveAccount(req.body)),
);
facilitators.get('/facilitator-accounts/:id/payments', async (req, res) => {
  const accountId = id(req.params.id);
  requireFound((await query('SELECT id FROM facilitator_accounts WHERE id=?', [accountId]))[0]);
  res.json(
    await query(
      'SELECT * FROM facilitator_payments WHERE account_id=? ORDER BY date DESC,id DESC',
      [accountId],
    ),
  );
});
facilitators.post('/facilitator-accounts/:id/payments', async (req, res) =>
  res.status(201).json(await savePayment(id(req.params.id), req.body)),
);
facilitators.put('/facilitator-accounts/:id/payments/:paymentId', async (req, res) =>
  res.json(await savePayment(id(req.params.id), req.body, id(req.params.paymentId))),
);
facilitators.delete('/facilitator-accounts/:id/payments/:paymentId', async (req, res) => {
  const accountId = id(req.params.id),
    paymentId = id(req.params.paymentId);
  await peopleTransaction(async (db) => {
    await lockAccount(accountId, db);
    requireFound(
      (
        await execute(
          'DELETE FROM facilitator_payments WHERE id=? AND account_id=?',
          [paymentId, accountId],
          db,
        )
      ).affectedRows,
    );
  });
  res.json({ ok: true });
});
