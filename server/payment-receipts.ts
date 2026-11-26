import { genericReceiptResources, receiptResourceAvailability } from './receipt-resources.js';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { query, execute, peopleTransaction, type Connection } from './db.js';
import { AppError } from './errors.js';
import { authorizeReceipt, receiptSchema } from './receipt-authority.js';
import { receiptFingerprint, signReceiptPreview, verifyReceiptPreview } from './receipt-preview.js';
import {
  receiptCommand,
  receiptPreviewInput,
  receiptNumber,
  type ReceiptSnapshot,
  type ReceiptPreviewInput,
  type PaymentReceipt,
} from '../shared/payment-receipts.js';

export function parseReceiptJson<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}
interface ReceiptRow {
  number: string;
  status: PaymentReceipt['status'];
  snapshot_json: ReceiptSnapshot | string;
  actor_id: string;
  issued_at: string;
  ended_at: string | null;
  ended_by: string | null;
  reason: string | null;
  replaces: string | null;
  replaced_by: string | null;
  payment_id: number | null;
  account_id: number | null;
  original_person_id: number;
  original_period_id: number;
}
const select = `SELECT CAST(number AS CHAR) number,status,snapshot_json,actor_id,CAST(issued_at AS CHAR) issued_at,
 CAST(ended_at AS CHAR) ended_at,ended_by,reason,CAST(replaces AS CHAR) replaces,CAST(replaced_by AS CHAR) replaced_by,
 payment_id,account_id,original_person_id,original_period_id FROM payment_receipts`;
async function getRow(number: string, db: Connection) {
  const [row] = await query<ReceiptRow>(
    select + ' WHERE number=? FOR UPDATE',
    [receiptNumber.parse(number)],
    db,
  );
  if (!row) throw new AppError(404, 'Recibo inexistente.');
  if (row.status === 'active' && (!row.payment_id || !row.account_id))
    throw new AppError(409, 'Recibo vigente sin movimiento operativo. Requiere revisión.');
  return row;
}
function present(row: ReceiptRow): PaymentReceipt {
  return {
    number: row.number,
    status: row.status,
    snapshot: parseReceiptJson(row.snapshot_json),
    actorId: row.actor_id,
    issuedAt: row.issued_at,
    endedAt: row.ended_at,
    endedBy: row.ended_by,
    reason: row.reason,
    replaces: row.replaces,
    replacedBy: row.replaced_by,
    reproduction: receiptResourceAvailability(parseReceiptJson(row.snapshot_json).resources),
  };
}
interface Source {
  paymentId: number;
  accountId: number;
  personId: number;
  periodId: number;
  publicId: string;
  personName: string;
  year: number;
  month: number;
  paymentDate: string;
  amount: string;
  method: string;
  recipient: string;
  obligation: string | null;
  accumulated: string;
}
async function previewSource(input: ReceiptPreviewInput, db: Connection) {
  const [p] = await query<Source>(
    `SELECT p.id paymentId,m.id accountId,m.person_id personId,m.period_id periodId,
   pe.public_id publicId,CONCAT(pe.apellido,', ',pe.nombre) personName,pr.year,pr.month,
   CAST(p.date AS CHAR) paymentDate,p.amount,p.method,p.recipient,m.amount_due obligation,
   (SELECT COALESCE(SUM(p2.amount),0) FROM payments p2 WHERE p2.account_id=m.id) accumulated
   FROM payments p JOIN monthly_accounts m ON m.id=p.account_id JOIN people pe ON pe.id=m.person_id
   JOIN periods pr ON pr.id=m.period_id WHERE p.id=? FOR UPDATE`,
    [input.paymentId],
    db,
  );
  if (!p) throw new AppError(404, 'Pago inexistente.');
  const activities = await query<{ enrollmentId: number; activityId: number; name: string }>(
    'SELECT e.id enrollmentId,e.activity_id activityId,o.name FROM enrollments e JOIN period_activities o ON o.period_id=e.period_id AND o.activity_id=e.activity_id WHERE e.person_id=? AND e.period_id=? ORDER BY e.id',
    [p.personId, p.periodId],
    db,
  );
  const snapshot: ReceiptSnapshot = {
    version: 1,
    templateVersion: 'administrative-v1',
    resources: genericReceiptResources,
    personId: p.personId,
    publicId: p.publicId,
    personName: p.personName,
    paymentId: p.paymentId,
    accountId: p.accountId,
    periodId: p.periodId,
    period: { year: p.year, month: p.month },
    paymentDate: p.paymentDate,
    amount: new Decimal(p.amount).toFixed(2),
    method: p.method,
    recipient: p.recipient,
    obligation: p.obligation === null ? null : new Decimal(p.obligation).toFixed(2),
    accumulated: new Decimal(p.accumulated).toFixed(2),
    balance:
      p.obligation === null ? null : new Decimal(p.obligation).minus(p.accumulated).toFixed(2),
    observation: input.observation,
    activities: [],
  };
  for (const a of activities)
    snapshot.activities.push({
      ...a,
      slots: await query<{ scheduleId: number | null; day: number; start: string; end: string }>(
        'SELECT schedule_id scheduleId,day,start,end FROM enrollment_slots WHERE enrollment_id=? ORDER BY day,start,id',
        [a.enrollmentId],
        db,
      ),
    });
  const [active] = await query<{ number: string }>(
    'SELECT CAST(number AS CHAR) number FROM payment_receipts WHERE active_payment_id=?',
    [p.paymentId],
    db,
  );
  let predecessor: ReceiptRow | undefined;
  if (input.replaces) {
    predecessor = await getRow(input.replaces, db);
    if (
      predecessor.replaced_by ||
      predecessor.original_person_id !== p.personId ||
      predecessor.original_period_id !== p.periodId
    )
      throw new AppError(
        409,
        'La sustitución requiere la misma persona y período y un último recibo sin reemplazo.',
      );
  }
  if (active && active.number !== input.replaces)
    throw new AppError(409, 'El pago ya tiene recibo vigente.', { receiptNumber: active.number });
  const movements = await query<{
    id: number;
    date: string;
    amount: string;
    method: string;
    recipient: string;
    updated_at: string;
  }>(
    'SELECT id,CAST(date AS CHAR) date,amount,method,recipient,CAST(updated_at AS CHAR) updated_at FROM payments WHERE account_id=? ORDER BY id',
    [p.accountId],
    db,
  );
  return {
    snapshot,
    sourceRevision: receiptFingerprint(movements),
    predecessor: predecessor ? { number: predecessor.number, status: predecessor.status } : null,
  };
}
export async function previewPaymentReceipt(token: string, raw: unknown) {
  const input = receiptPreviewInput.parse(raw);
  return peopleTransaction(async (db) => {
    await receiptSchema(db);
    const actor = await authorizeReceipt(db, token);
    const source = await previewSource(input, db);
    const expiresAt = Date.now() + 5 * 60 * 1000;
    return {
      ...source,
      expiresAt,
      previewToken: signReceiptPreview(
        { actor, expiresAt, fingerprint: receiptFingerprint(source) },
        process.env.RECEIPT_PREVIEW_SECRET ?? '',
      ),
    };
  });
}
export async function previousReceiptOperation<T>(
  db: Connection,
  operationId: string,
  actor: string,
  request: unknown,
): Promise<T | undefined> {
  const [old] = await query<{ actor_id: string; request_hash: string; result_json: T | string }>(
    'SELECT actor_id,request_hash,result_json FROM payment_receipt_operations WHERE operation_id=? FOR UPDATE',
    [operationId],
    db,
  );
  if (!old) return undefined;
  if (old.actor_id !== actor || old.request_hash !== receiptFingerprint(request))
    throw new AppError(409, 'La clave de operación ya se utilizó con otro actor o contenido.');
  return parseReceiptJson(old.result_json);
}
export async function recordReceiptOperation(
  db: Connection,
  operationId: string,
  actor: string,
  request: unknown,
  result: unknown,
  evidence: unknown,
) {
  await execute(
    'INSERT INTO payment_receipt_operations(operation_id,actor_id,request_hash,result_json,evidence_json) VALUES (?,?,?,?,?)',
    [
      operationId,
      actor,
      receiptFingerprint(request),
      JSON.stringify(result),
      JSON.stringify(evidence),
    ],
    db,
  );
}
export async function mutatePaymentReceipt(token: string, raw: unknown): Promise<PaymentReceipt> {
  const input = receiptCommand.parse(raw);
  return peopleTransaction(async (db) => {
    await receiptSchema(db);
    const actor = await authorizeReceipt(db, token);
    const previous = await previousReceiptOperation<PaymentReceipt>(
      db,
      input.operationId,
      actor,
      input,
    );
    if (previous) return previous;
    let number: string;
    if (input.kind === 'void') {
      const old = await getRow(input.receiptNumber, db);
      if (old.status !== 'active')
        throw new AppError(409, 'Solo se puede anular un recibo vigente.');
      await execute(
        "UPDATE payment_receipts SET status='void',ended_at=CURRENT_TIMESTAMP(3),ended_by=?,reason=? WHERE number=?",
        [actor, input.reason, old.number],
        db,
      );
      number = old.number;
    } else {
      const claims = verifyReceiptPreview(
        input.previewToken,
        actor,
        process.env.RECEIPT_PREVIEW_SECRET ?? '',
      );
      const source = await previewSource(input, db);
      if (claims.fingerprint !== receiptFingerprint(source))
        throw new AppError(409, 'Las fuentes cambiaron. Revisá nuevamente el recibo.');
      if (source.predecessor?.status === 'active')
        await execute(
          "UPDATE payment_receipts SET status='void',ended_at=CURRENT_TIMESTAMP(3),ended_by=?,reason='Sustitución administrativa' WHERE number=?",
          [actor, input.replaces],
          db,
        );
      const s = source.snapshot;
      await execute(
        `INSERT INTO payment_receipts(original_person_id,original_period_id,original_payment_id,original_account_id,payment_id,account_id,status,snapshot_json,actor_id,replaces)
        VALUES (?,?,?,?,?,?,'active',?,?,?)`,
        [
          s.personId,
          s.periodId,
          s.paymentId,
          s.accountId,
          s.paymentId,
          s.accountId,
          JSON.stringify(s),
          actor,
          input.replaces ?? null,
        ],
        db,
      );
      const [inserted] = await query<{ number: string }>(
        'SELECT CAST(LAST_INSERT_ID() AS CHAR) number',
        [],
        db,
      );
      number = inserted.number;
      if (input.replaces)
        await execute(
          "UPDATE payment_receipts SET status='replaced',replaced_by=? WHERE number=?",
          [number, input.replaces],
          db,
        );
    }
    const result = present(await getRow(number, db));
    await recordReceiptOperation(db, input.operationId, actor, input, result, {
      kind: input.kind,
      receiptNumber: number,
      replaces: result.replaces,
    });
    return result;
  });
}
export async function readPaymentReceipts(
  token: string,
  raw: { personId?: number; periodId?: number; number?: string; before?: string },
) {
  const input = z
    .object({
      personId: z.number().int().positive().optional(),
      periodId: z.number().int().positive().optional(),
      number: receiptNumber.optional(),
      before: receiptNumber.optional(),
    })
    .strict()
    .parse(raw);
  if (!input.number && !input.personId)
    throw new AppError(422, 'Indicá la identidad histórica de la persona.');
  return peopleTransaction(async (db) => {
    await receiptSchema(db);
    await authorizeReceipt(db, token);
    if (input.number) return present(await getRow(input.number, db));
    const rows = await query<ReceiptRow>(
      select +
        ' WHERE original_person_id=?' +
        (input.periodId ? ' AND original_period_id=?' : '') +
        (input.before ? ' AND number<?' : '') +
        ' ORDER BY number DESC LIMIT 51',
      [
        input.personId,
        ...(input.periodId ? [input.periodId] : []),
        ...(input.before ? [input.before] : []),
      ],
      db,
    );
    return {
      items: rows.slice(0, 50).map(present),
      nextBefore: rows.length > 50 ? rows[49].number : null,
    };
  });
}
