import { eventSchemaReady } from './event-schema.js';
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import {
  calculateEventTotals,
  commercialCollections,
  eventCreateSchema,
  eventDeleteSchema,
  eventEditSchema,
  eventStatusChangeSchema,
  eventRescheduleSchema,
  eventParticipantSchema,
  eventParticipantEditSchema,
  eventMovementSchema,
  eventVoidSchema,
  type EventMovement,
  type EventParticipant,
} from '../shared/special-events.js';
import { pool, query, execute, peopleTransaction, type Connection } from './db.js';
import { openPeriod } from './scheduling.js';
import { AppError, requireFound } from './errors.js';
import { positiveId } from './services.js';
import {
  hasEventExpenses,
  eventExpenseRows,
  cancellationExpenses,
  detachCancellationExpenses,
  requireEventExpenses,
  additionalCategory,
} from './event-expenses.js';
import { associatedExpenseSchema } from '../shared/expenses.js';

interface Receipt {
  id: number;
  revision: number;
}
interface HistoryEntry {
  request_id: string;
  hash: string;
  action: string;
  at: string;
  actor: 'administration';
  changes: unknown;
  result: Receipt;
}
interface EventRow {
  id: number;
  event_number: number;
  location: string;
  period_id: number;
  name: string;
  description: string;
  date: string;
  start_time: string;
  end_time: string;
  price: string;
  capacity: number | null;
  status: 'draft' | 'confirmed' | 'held' | 'cancelled';
  notes: string;
  revision: number;
  history: HistoryEntry[] | string;
  creation_request_id: string;
  creation_hash: string;
}
const conflict = (message: string) => new AppError(409, message);
// Objects passed here have already been parsed into a fixed order by Zod.
const hash = (action: string, body: unknown) =>
  createHash('sha256')
    .update(JSON.stringify([action, body]))
    .digest('hex');
const historyOf = (event: EventRow): HistoryEntry[] =>
  typeof event.history === 'string' ? (JSON.parse(event.history) as HistoryEntry[]) : event.history;

export async function requireEventSchema(db: Connection = pool) {
  if (!(await eventSchemaReady(db)))
    throw new AppError(503, 'Eventos no disponible: falta activar la migración 016.');
}
function found<T>(row: T | undefined): T {
  requireFound(row);
  return row!;
}
function operational(event: EventRow) {
  if (event.status === 'cancelled')
    throw conflict('El evento fue eliminado y no admite operaciones comerciales.');
}
function checkDate(date: string, period: { year: number; month: number }) {
  if (date.slice(0, 7) !== `${period.year}-${String(period.month).padStart(2, '0')}`)
    throw new AppError(422, 'La fecha del evento debe pertenecer al período seleccionado.');
}
async function participants(event: number, db: Connection) {
  return query<EventParticipant>(
    `SELECT p.*,pe.nombre,pe.apellido FROM event_participants p
    JOIN people pe ON pe.id=p.person_id WHERE p.event_id=? ORDER BY p.id`,
    [event],
    db,
  );
}
async function movements(event: number, db: Connection) {
  return query<EventMovement>(
    `SELECT m.* FROM event_money_movements m
    JOIN event_participants p ON p.id=m.participant_id WHERE p.event_id=? ORDER BY m.id`,
    [event],
    db,
  );
}
async function participant(event: number, id: number, db: Connection) {
  return found(
    (
      await query<EventParticipant>(
        'SELECT * FROM event_participants WHERE event_id=? AND id=? FOR UPDATE',
        [event, id],
        db,
      )
    )[0],
  );
}
async function nextNumber(period: number, db: Connection) {
  const [row] = await query<{ event_sequence: number }>(
    'SELECT event_sequence FROM periods WHERE id=? FOR UPDATE',
    [period],
    db,
  );
  if (row.event_sequence === 4294967295) throw conflict('Se alcanzó el límite de numeración.');
  const next = row.event_sequence + 1;
  await execute('UPDATE periods SET event_sequence=? WHERE id=?', [next, period], db);
  return next;
}
async function deletedReceipts(db: Connection) {
  const rows = await query<{ event_delete_receipts: any }>(
    'SELECT event_delete_receipts FROM periods WHERE event_delete_receipts IS NOT NULL',
    [],
    db,
  );
  return rows.flatMap((r) =>
    typeof r.event_delete_receipts === 'string'
      ? JSON.parse(r.event_delete_receipts)
      : r.event_delete_receipts,
  ) as {
    event_id: number;
    creation_request_id: string;
    creation_hash: string;
    request_id: string;
    hash: string;
    result: Receipt;
  }[];
}

export async function command(
  eventId: number,
  action: string,
  input: { request_id: string; expected_revision: number },
  run: (event: EventRow, db: Connection) => Promise<{ id?: number; changes: unknown }>,
) {
  return peopleTransaction(async (db) => {
    await requireEventSchema(db);
    const removed = (await deletedReceipts(db)).find((r) => r.event_id === eventId);
    if (removed) {
      if (removed.request_id === input.request_id && removed.hash === hash(action, input))
        return removed.result;
      throw new AppError(404, 'El evento fue eliminado.');
    }
    const event = found(
      (
        await query<EventRow>('SELECT * FROM special_events WHERE id=? FOR UPDATE', [eventId], db)
      )[0],
    );
    const history = historyOf(event),
      fingerprint = hash(action, input);
    const receipt = history.find((entry) => entry.request_id === input.request_id);
    // A successful retry is a read of the durable receipt, even after closure or rescheduling.
    if (receipt) {
      if (receipt.hash !== fingerprint)
        throw conflict('La clave de solicitud ya se utilizó con otros datos.');
      return receipt.result;
    }
    await openPeriod(event.period_id, db);
    if (event.revision !== input.expected_revision)
      throw conflict('El evento cambió. Volvé a consultarlo antes de guardar.');
    if (event.revision === 4294967295)
      throw conflict('Se alcanzó el límite de revisiones del evento.');
    const change = await run(event, db);
    const result = { id: change.id ?? event.id, revision: event.revision + 1 };
    history.push({
      request_id: input.request_id,
      hash: fingerprint,
      action,
      at: new Date().toISOString(),
      actor: 'administration',
      changes: change.changes,
      result,
    });
    await execute(
      'UPDATE special_events SET revision=?,history=? WHERE id=?',
      [result.revision, JSON.stringify(history), event.id],
      db,
    );
    return result;
  });
}

export async function eventCreate(body: unknown) {
  const input = eventCreateSchema.parse(body),
    fingerprint = hash('create', input);
  return peopleTransaction(async (db) => {
    await requireEventSchema(db);
    const removed = (await deletedReceipts(db)).find(
      (r) => r.creation_request_id === input.request_id,
    );
    if (removed) {
      if (removed.creation_hash !== fingerprint)
        throw conflict('La clave de solicitud ya se utilizó con otros datos.');
      return { id: removed.event_id, revision: 1 };
    }
    const [old] = await query<EventRow>(
      'SELECT * FROM special_events WHERE creation_request_id=? FOR UPDATE',
      [input.request_id],
      db,
    );
    if (old) {
      if (old.creation_hash !== fingerprint)
        throw conflict('La clave de solicitud ya se utilizó con otros datos.');
      return { id: old.id, revision: 1 };
    }
    checkDate(input.date, await openPeriod(input.period_id, db));
    const number = await nextNumber(input.period_id, db);
    const { insertId } = await execute(
      `INSERT INTO special_events
      (period_id,name,description,date,start_time,end_time,price,capacity,notes,creation_request_id,creation_hash,history,event_number,location)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        input.period_id,
        input.name,
        input.description,
        input.date,
        input.start_time,
        input.end_time,
        input.price,
        input.capacity,
        input.notes,
        input.request_id,
        fingerprint,
        '[]',
        number,
        input.location,
      ],
      db,
    );
    const result = { id: insertId, revision: 1 };
    await execute(
      'UPDATE special_events SET history=? WHERE id=?',
      [
        JSON.stringify([
          {
            request_id: input.request_id,
            hash: fingerprint,
            action: 'create',
            at: new Date().toISOString(),
            actor: 'administration',
            changes: input,
            result,
          },
        ]),
        insertId,
      ],
      db,
    );
    return result;
  });
}
export async function eventEdit(eventId: number, body: unknown) {
  const input = eventEditSchema.parse(body);
  return command(eventId, 'edit', input, async (event, db) => {
    operational(event);
    const period = found(
      (
        await query<{ year: number; month: number }>(
          'SELECT year,month FROM periods WHERE id=?',
          [event.period_id],
          db,
        )
      )[0],
    );
    checkDate(input.date, period);

    const before = {
      name: event.name,
      location: event.location,
      description: event.description,
      date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
      price: event.price,
      capacity: event.capacity,
      notes: event.notes,
    };
    await execute(
      'UPDATE special_events SET name=?,description=?,date=?,start_time=?,end_time=?,price=?,capacity=?,notes=?,location=? WHERE id=?',
      [
        input.name,
        input.description,
        input.date,
        input.start_time,
        input.end_time,
        input.price,
        input.capacity,
        input.notes,
        input.location,
        eventId,
      ],
      db,
    );
    return { changes: { before, after: input } };
  });
}
export async function eventSetStatus(eventId: number, body: unknown) {
  const input = eventStatusChangeSchema.parse(body);
  if (input.status === 'cancelled')
    return eventDelete(eventId, {
      request_id: input.request_id,
      expected_revision: input.expected_revision,
      reason: input.reason,
    });
  return command(eventId, 'status', input, async (event, db) => {
    operational(event);
    await execute('UPDATE special_events SET status=? WHERE id=?', [input.status, eventId], db);
    return {
      changes: {
        before: event.status,
        after: input.status,
        reason: input.reason,
      },
    };
  });
}
export async function eventDelete(eventId: number, body: unknown) {
  const input = eventDeleteSchema.parse(body);
  return command(eventId, 'delete', input, async (event, db) => {
    operational(event);
    const people = await participants(eventId, db);
    const [expenseHistory] = await query<{ n: number }>(
      'SELECT COUNT(*) n FROM period_expenses WHERE special_event_id=?',
      [eventId],
      db,
    );
    const historicalExpense = historyOf(event).some((h) => h.action.startsWith('expense-'));
    if (!people.length && !expenseHistory.n && !historicalExpense) {
      const [period] = await query<{ event_delete_receipts: any }>(
        'SELECT event_delete_receipts FROM periods WHERE id=? FOR UPDATE',
        [event.period_id],
        db,
      );
      const receipts =
        typeof period.event_delete_receipts === 'string'
          ? JSON.parse(period.event_delete_receipts)
          : (period.event_delete_receipts ?? []);
      receipts.push({
        event_id: eventId,
        creation_request_id: event.creation_request_id,
        creation_hash: event.creation_hash,
        request_id: input.request_id,
        hash: hash('delete', input),
        result: { id: eventId, revision: event.revision + 1 },
      });
      await execute(
        'UPDATE periods SET event_delete_receipts=? WHERE id=?',
        [JSON.stringify(receipts), event.period_id],
        db,
      );
      await execute('DELETE FROM special_events WHERE id=?', [eventId], db);
      return { changes: { deleted: true } };
    }
    const expenses = await detachCancellationExpenses(eventId, input.reopen_period_ids, db);
    await execute("UPDATE special_events SET status='cancelled' WHERE id=?", [eventId], db);
    await execute('UPDATE event_participants SET active=0 WHERE event_id=?', [eventId], db);
    return {
      changes: {
        cancelled: true,
        name: event.name,
        date: event.date,
        participant_count: people.filter((p) => p.active).length,
        reason: input.reason,
        expenses,
      },
    };
  });
}

// Materialize legacy deductions only when correcting a legacy payment. Original rows are
// preserved in the command audit; refund recipient never contributes to commercial wallets.
async function normalizeLegacyPayments(eventId: number, participantId: number, db: Connection) {
  const before = (await movements(eventId, db)).filter(
    (m) => m.participant_id === participantId && !m.voided_at,
  );
  if (!before.some((m) => m.kind === 'refund')) return [];
  for (const m of commercialCollections(before)) {
    if (new Decimal(m.amount).eq(0))
      await execute(
        "UPDATE event_money_movements SET voided_at=UTC_TIMESTAMP(3),void_reason='Deducción histórica íntegra' WHERE id=?",
        [m.id],
        db,
      );
    else
      await execute('UPDATE event_money_movements SET amount=? WHERE id=?', [m.amount, m.id], db);
  }
  await execute(
    "UPDATE event_money_movements SET voided_at=UTC_TIMESTAMP(3),void_reason='Deducción histórica atribuida a cobros originales' WHERE participant_id=? AND kind='refund' AND voided_at IS NULL",
    [participantId],
    db,
  );
  return before;
}

export async function eventMovementEdit(eventId: number, movementId: number, body: unknown) {
  const input = eventMovementSchema.parse(body);
  if (input.kind !== 'collection') throw new AppError(422, 'Solo se editan cobros.');
  return command(eventId, `movement-edit:${movementId}`, input, async (event, db) => {
    operational(event);
    const before = found(
      (await movements(eventId, db)).find(
        (m) => m.id === movementId && !m.voided_at && m.kind === 'collection',
      ),
    );
    if (!(await participant(eventId, before.participant_id, db)).active)
      throw conflict('La inscripción fue eliminada.');
    const legacy = await normalizeLegacyPayments(eventId, before.participant_id, db);
    const current = found(
      (await movements(eventId, db)).find((m) => m.id === movementId && !m.voided_at),
    );
    await execute(
      'UPDATE event_money_movements SET date=?,amount=?,recipient=?,method=?,notes=? WHERE id=?',
      [input.date, input.amount, input.recipient, input.method, input.notes, movementId],
      db,
    );
    return { id: movementId, changes: { before, current, legacy, after: input } };
  });
}
export async function eventReschedule(eventId: number, body: unknown) {
  const input = eventRescheduleSchema.parse(body);
  return command(eventId, 'reschedule', input, async (event, db) => {
    operational(event);
    checkDate(input.date, await openPeriod(input.period_id, db));
    if (input.expense_categories.length)
      throw new AppError(
        422,
        'Reprogramar no traslada gastos. Revisá la asociación en Gastos Período.',
      );
    const number =
      event.period_id === input.period_id
        ? event.event_number
        : await nextNumber(input.period_id, db);
    await execute(
      'UPDATE special_events SET period_id=?,date=?,start_time=?,end_time=?,event_number=? WHERE id=?',
      [input.period_id, input.date, input.start_time, input.end_time, number, eventId],
      db,
    );
    return {
      changes: {
        before: {
          period_id: event.period_id,
          date: event.date,
          start_time: event.start_time,
          end_time: event.end_time,
        },
        after: input,
      },
    };
  });
}
export async function eventParticipantAdd(eventId: number, body: unknown) {
  const input = eventParticipantSchema.parse(body);
  return command(eventId, 'participant-add', input, async (event, db) => {
    operational(event);
    requireFound(
      (
        await query(
          'SELECT id FROM people WHERE id=? AND activo=1 FOR UPDATE',
          [input.person_id],
          db,
        )
      )[0],
    );
    const [existing] = await query<EventParticipant>(
      'SELECT * FROM event_participants WHERE event_id=? AND person_id=? FOR UPDATE',
      [eventId, input.person_id],
      db,
    );
    if (existing) {
      if (existing.active) throw conflict('La persona ya está inscripta.');
      await execute(
        "UPDATE event_money_movements SET voided_at=UTC_TIMESTAMP(3),void_reason='Baja de inscripción anterior' WHERE participant_id=? AND voided_at IS NULL",
        [existing.id],
        db,
      );
      await execute('UPDATE event_participants SET active=1 WHERE id=?', [existing.id], db);
      return { id: existing.id, changes: { participant_id: existing.id, reinstated: true } };
    }
    const { insertId } = await execute(
      'INSERT INTO event_participants(event_id,person_id,price,notes) VALUES (?,?,?,?)',
      [eventId, input.person_id, input.price, input.notes],
      db,
    );

    return {
      id: insertId,
      changes: {
        participant_id: insertId,
        person_id: input.person_id,
        price: input.price,
        notes: input.notes,
      },
    };
  });
}
export async function eventParticipantEdit(eventId: number, participantId: number, body: unknown) {
  const input = eventParticipantEditSchema.parse(body);
  return command(eventId, `participant-edit:${participantId}`, input, async (event, db) => {
    operational(event);
    const before = await participant(eventId, participantId, db);
    if (input.active && !before.active)
      requireFound(
        (
          await query(
            'SELECT id FROM people WHERE id=? AND activo=1 FOR UPDATE',
            [before.person_id],
            db,
          )
        )[0],
      );
    if (!input.active || !before.active)
      await execute(
        "UPDATE event_money_movements SET voided_at=UTC_TIMESTAMP(3),void_reason='Eliminación de inscripción con devolución administrativa' WHERE participant_id=? AND voided_at IS NULL",
        [participantId],
        db,
      );
    await execute(
      'UPDATE event_participants SET price=?,notes=?,active=? WHERE id=?',
      [input.price, input.notes, input.active, participantId],
      db,
    );

    return { id: participantId, changes: { participant_id: participantId, before, after: input } };
  });
}
export async function eventMovementAdd(eventId: number, participantId: number, body: unknown) {
  const input = eventMovementSchema.parse(body);
  if (input.kind !== 'collection')
    throw new AppError(
      422,
      'Los reintegros no son una operación administrativa. Eliminá la inscripción cuando se devuelve íntegramente lo recibido.',
    );
  return command(eventId, `movement-add:${participantId}`, input, async (event, db) => {
    const person = await participant(eventId, participantId, db);
    if (input.kind === 'collection') {
      operational(event);
      if (!person.active) throw conflict('No se puede cobrar una participación retirada.');
    }
    const totals = calculateEventTotals(
      [person],
      (await movements(eventId, db)).filter((m) => m.participant_id === participantId),
    );
    if (input.kind === 'refund' && new Decimal(input.amount).gt(totals.effective_net))
      throw conflict('El reintegro supera el importe efectivamente cobrado y no reintegrado.');
    const { insertId } = await execute(
      `INSERT INTO event_money_movements
      (participant_id,request_id,kind,date,amount,recipient,method,notes) VALUES (?,?,?,?,?,?,?,?)`,
      [
        participantId,
        input.request_id,
        input.kind,
        input.date,
        input.amount,
        input.recipient,
        input.method,
        input.notes,
      ],
      db,
    );
    return {
      id: insertId,
      changes: { movement_id: insertId, participant_id: participantId, kind: input.kind },
    };
  });
}
export async function eventMovementVoid(eventId: number, movementId: number, body: unknown) {
  const input = eventVoidSchema.parse(body);
  return command(eventId, `movement-void:${movementId}`, input, async (event, db) => {
    operational(event);
    const all = await movements(eventId, db),
      movement = found(all.find((m) => m.id === movementId));
    if (movement.voided_at) throw conflict('El registro ya está anulado.');
    const legacy = await normalizeLegacyPayments(eventId, movement.participant_id, db);
    const proposed = (await movements(eventId, db)).filter(
      (m) => m.id !== movementId && m.participant_id === movement.participant_id,
    );
    const totals = proposed.reduce(
      (s, m) =>
        m.voided_at
          ? s
          : s.plus(m.kind === 'collection' ? m.amount : new Decimal(m.amount).negated()),
      new Decimal(0),
    );
    if (totals.isNegative())
      throw conflict('No se puede anular el cobro: existen reintegros que dependen de él.');
    await execute(
      'UPDATE event_money_movements SET voided_at=UTC_TIMESTAMP(3),void_reason=? WHERE id=?',
      [input.reason, movementId],
      db,
    );
    return {
      id: movementId,
      changes: { movement_id: movementId, before: movement, legacy, reason: input.reason },
    };
  });
}

export async function eventList(periodId: number, includeCancelled = false) {
  await requireEventSchema();
  requireFound((await query('SELECT id FROM periods WHERE id=?', [periodId]))[0]);
  return query(
    `SELECT id,event_number,period_id,name,date,start_time,end_time,price,capacity,status,revision
    FROM special_events WHERE period_id=? ${includeCancelled ? '' : "AND status<>'cancelled'"} ORDER BY event_number`,
    [periodId],
  );
}
export async function eventDetail(eventId: number) {
  await requireEventSchema();
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const event = found(
      (await query<EventRow>('SELECT * FROM special_events WHERE id=?', [eventId], db))[0],
    );
    const all = await movements(eventId, db),
      totals = calculateEventTotals(await participants(eventId, db), all);
    const { creation_hash: _hash, creation_request_id: _request, history, ...publicEvent } = event;
    const costs = (await hasEventExpenses(db)) ? await eventExpenseRows(eventId, db) : undefined;
    const direct = costs?.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toFixed(2);
    const result = {
      ...publicEvent,
      ...totals,
      available: null,
      movements: all,
      history: historyOf({ ...event, history }),
      ...(direct === undefined
        ? {}
        : {
            expenses: costs,
            direct_expenses: direct,
            commercial_net: new Decimal(totals.gross).minus(direct).toFixed(2),
          }),
    };
    await db.commit();
    return result;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

// Technical historical reader. Commercial consolidation uses readIncomeSources instead.
export async function readEventFinancialRows(periodId: number, db: Connection) {
  await requireEventSchema(db);
  return query<EventMovement & { event_id: number; period_id: number }>(
    `SELECT m.*,e.id event_id,e.period_id
    FROM event_money_movements m JOIN event_participants p ON p.id=m.participant_id
    JOIN special_events e ON e.id=p.event_id WHERE e.period_id=? AND m.voided_at IS NULL ORDER BY m.id`,
    [periodId],
    db,
  );
}

export async function eventExpenseSave(eventId: number, body: unknown, expenseId?: number) {
  const input = associatedExpenseSchema.parse(body);
  return command(eventId, `expense-save:${expenseId ?? 'new'}`, input, async (event, db) => {
    await requireEventExpenses(db);
    const [before] = expenseId
      ? await query<Record<string, any>>(
          `SELECT e.*,c.period_id FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id WHERE e.id=? FOR UPDATE`,
          [expenseId],
          db,
        )
      : [];
    if (expenseId) {
      requireFound(before);
      if (
        before.voided_at ||
        (before.special_event_id !== null && before.special_event_id !== eventId)
      )
        throw conflict('El gasto no pertenece a este evento o está anulado.');
      await openPeriod(before.period_id, db);
      await additionalCategory(before.period_id, before.category_id, db);
    }
    if (input.special_event_id !== null) operational(event);
    if (input.special_event_id !== null && input.special_event_id !== eventId)
      throw conflict('El evento asociado no coincide.');
    if (input.special_event_id === null && (!before || before.special_event_id !== eventId))
      throw conflict('Solo se puede desvincular un gasto actualmente asociado.');
    const target = await openPeriod(input.period_id, db);
    await additionalCategory(input.period_id, input.category_id, db);
    const month = `${target.year}-${String(target.month).padStart(2, '0')}`;
    if (
      input.special_event_id === null
        ? input.date.slice(0, 7) !== month
        : before?.special_event_id === eventId && before.period_id === input.period_id
          ? input.date.slice(0, 7) > month
          : input.period_id !== event.period_id || input.date.slice(0, 7) > month
    )
      throw new AppError(
        422,
        'La fecha y categoría deben corresponder al período económico; solo gastos asociados admiten fechas anteriores.',
      );
    const values = [
      input.category_id,
      input.concept,
      input.date,
      input.amount,
      input.notes,
      input.special_event_id,
    ];
    const id =
      expenseId ??
      (
        await execute(
          'INSERT INTO period_expenses(category_id,concept,date,amount,notes,special_event_id) VALUES (?,?,?,?,?,?)',
          values,
          db,
        )
      ).insertId;
    if (expenseId)
      await execute(
        'UPDATE period_expenses SET category_id=?,concept=?,date=?,amount=?,notes=?,special_event_id=? WHERE id=?',
        [...values, id],
        db,
      );
    return { id, changes: { expense_id: id, before: before ?? null, after: input } };
  });
}
export async function eventExpenseVoid(eventId: number, expenseId: number, body: unknown) {
  const input = eventVoidSchema.parse(body);
  return command(eventId, `expense-void:${expenseId}`, input, async (_event, db) => {
    await requireEventExpenses(db);
    const before = (await eventExpenseRows(eventId, db)).find((e) => e.id === expenseId);
    requireFound(before);
    await openPeriod(before!.period_id, db);
    await execute(
      'UPDATE period_expenses SET voided_at=UTC_TIMESTAMP(3),void_reason=? WHERE id=?',
      [input.reason, expenseId],
      db,
    );
    return { id: expenseId, changes: { expense_id: expenseId, before, reason: input.reason } };
  });
}
export const specialEvents = Router();
specialEvents.post('/:id/expenses', async (req, res) =>
  res.status(201).json(await eventExpenseSave(positiveId.parse(req.params.id), req.body)),
);
specialEvents.patch('/:id/expenses/:expenseId', async (req, res) =>
  res.json(
    await eventExpenseSave(
      positiveId.parse(req.params.id),
      req.body,
      positiveId.parse(req.params.expenseId),
    ),
  ),
);
specialEvents.post('/:id/expenses/:expenseId/void', async (req, res) =>
  res.json(
    await eventExpenseVoid(
      positiveId.parse(req.params.id),
      positiveId.parse(req.params.expenseId),
      req.body,
    ),
  ),
);
const id = (value: unknown) => positiveId.parse(value);
specialEvents.get('/', async (req, res) => {
  const input = z
    .object({
      period_id: z.coerce.number().int().positive(),
      include_cancelled: z.enum(['true', 'false']).default('false'),
    })
    .strict()
    .parse(req.query);
  res.json(await eventList(input.period_id, input.include_cancelled === 'true'));
});
specialEvents.post('/', async (req, res) => res.status(201).json(await eventCreate(req.body)));
specialEvents.get('/:id/deletion-preview', async (req, res) => {
  const eventId = id(req.params.id);
  await requireEventSchema();
  const db = await pool.getConnection();
  try {
    await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    requireFound((await query('SELECT id FROM special_events WHERE id=?', [eventId], db))[0]);
    const plan = await cancellationExpenses(eventId, db);
    await db.commit();
    res.json({
      reopen_periods: [
        ...new Map(
          plan
            .flatMap((p) => [p.period, p.source_period])
            .filter((p) => p.status === 'closed')
            .map((p) => [p.id, p]),
        ).values(),
      ],
    });
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
});
specialEvents.post('/:id/delete', async (req, res) =>
  res.json(await eventDelete(id(req.params.id), req.body)),
);
specialEvents.patch('/:id/movements/:movementId', async (req, res) =>
  res.json(await eventMovementEdit(id(req.params.id), id(req.params.movementId), req.body)),
);
specialEvents.get('/:id', async (req, res) => res.json(await eventDetail(id(req.params.id))));
specialEvents.patch('/:id', async (req, res) =>
  res.json(await eventEdit(id(req.params.id), req.body)),
);
specialEvents.post('/:id/status', async (req, res) =>
  res.json(await eventSetStatus(id(req.params.id), req.body)),
);
specialEvents.post('/:id/reschedule', async (req, res) =>
  res.json(await eventReschedule(id(req.params.id), req.body)),
);
specialEvents.post('/:id/participants', async (req, res) =>
  res.status(201).json(await eventParticipantAdd(id(req.params.id), req.body)),
);
specialEvents.patch('/:id/participants/:participantId', async (req, res) =>
  res.json(await eventParticipantEdit(id(req.params.id), id(req.params.participantId), req.body)),
);
specialEvents.post('/:id/participants/:participantId/movements', async (req, res) =>
  res
    .status(201)
    .json(await eventMovementAdd(id(req.params.id), id(req.params.participantId), req.body)),
);
specialEvents.post('/:id/movements/:movementId/void', async (req, res) =>
  res.json(await eventMovementVoid(id(req.params.id), id(req.params.movementId), req.body)),
);
