import { Decimal } from 'decimal.js';
import { query, type Connection } from './db.js';
import {
  calculateEventTotals,
  commercialCollections,
  type EventParticipant,
  type EventMovement,
} from '../shared/special-events.js';
import { eventEconomySchema } from '../shared/event-economy.js';
import { AppError } from './errors.js';
import { eventSchemaReady } from './event-schema.js';
const Money = Decimal.clone({ precision: 40 });
export async function readIncomeSources(period: number, db: Connection) {
  const [workshop] = await query<{ amount: string }>(
    `SELECT COALESCE(SUM(p.amount),0) amount FROM payments p JOIN monthly_accounts a ON a.id=p.account_id WHERE a.period_id=?`,
    [period],
    db,
  );
  const activated = await eventSchemaReady(db);
  const rows = activated
    ? await query<EventMovement>(
        `SELECT m.* FROM event_money_movements m JOIN event_participants p ON p.id=m.participant_id JOIN special_events e ON e.id=p.event_id WHERE e.period_id=? AND e.status<>'cancelled' AND p.active=1 AND m.voided_at IS NULL`,
        [period],
        db,
      )
    : [];
  const sum = (kind: 'collection' | 'refund') =>
    rows.filter((r) => r.kind === kind).reduce((s, r) => s.plus(r.amount), new Money(0));
  const collections = sum('collection'),
    refunds = sum('refund'),
    events = collections.minus(refunds);
  const commercial = commercialCollections(rows);
  const wallets = {
    jesica: { cash: '0.00', transfer: '0.00', total: '0.00' },
    hernan: { cash: '0.00', transfer: '0.00', total: '0.00' },
  };
  const all = await query<{
    recipient: 'jesica' | 'hernan';
    method: 'cash' | 'transfer';
    amount: string;
  }>(
    `SELECT p.recipient,p.method,p.amount FROM payments p JOIN monthly_accounts a ON a.id=p.account_id WHERE a.period_id=?`,
    [period],
    db,
  );
  const eventWallets = structuredClone(wallets);
  for (const [movements, target] of [
    [all, wallets],
    [commercial, eventWallets],
  ] as const) {
    for (const movement of movements) {
      const w = target[movement.recipient];
      w[movement.method] = new Money(w[movement.method]).plus(movement.amount).toFixed(2);
      w.total = new Money(w.total).plus(movement.amount).toFixed(2);
    }
  }
  const income = {
    workshops: new Money(workshop.amount).toFixed(2),
    event_collections: collections.toFixed(2),
    event_refunds: refunds.toFixed(2),
    events: events.toFixed(2),
    total: new Money(workshop.amount).plus(events).toFixed(2),
  };
  if (
    !new Money(wallets.jesica.total)
      .plus(wallets.hernan.total)
      .plus(eventWallets.jesica.total)
      .plus(eventWallets.hernan.total)
      .eq(income.total)
  )
    throw Error('No se pudieron conciliar Carteras.');
  return {
    income,
    wallets,
    eventWallets,
    cash: new Money(wallets.jesica.cash).plus(wallets.hernan.cash).toFixed(2),
    transfer: new Money(wallets.jesica.transfer).plus(wallets.hernan.transfer).toFixed(2),
  };
}
export async function readEventEconomy(periodId: number, db: Connection) {
  if (!(await eventSchemaReady(db))) throw new AppError(503, 'Falta integración de Eventos 016.');
  const [period] = await query(
    'SELECT id,year,month,status FROM periods WHERE id=?',
    [periodId],
    db,
  );
  if (!period) throw new AppError(404, 'Período inexistente.');
  const events = await query<{
    id: number;
    event_number: number;
    history: any;
    name: string;
    date: string;
    status: 'draft' | 'confirmed' | 'held' | 'cancelled';
  }>(
    'SELECT id,event_number,name,date,status,history FROM special_events WHERE period_id=? ORDER BY event_number',
    [periodId],
    db,
  );
  const people = await query<EventParticipant>(
    'SELECT p.* FROM event_participants p JOIN special_events e ON e.id=p.event_id WHERE e.period_id=?',
    [periodId],
    db,
  );
  const money = await query<EventMovement>(
    'SELECT m.* FROM event_money_movements m JOIN event_participants p ON p.id=m.participant_id JOIN special_events e ON e.id=p.event_id WHERE e.period_id=?',
    [periodId],
    db,
  );
  const expenses = await query<{ event_id: number; amount: string }>(
    `SELECT e.special_event_id event_id,e.amount FROM period_expenses e JOIN period_expense_categories c ON c.id=e.category_id JOIN special_events se ON se.id=e.special_event_id WHERE se.period_id=? AND se.status<>'cancelled' AND e.voided_at IS NULL`,
    [periodId],
    db,
  );
  const rows = events.map((event) => {
    const participants = people.filter((p) => p.event_id === event.id),
      movements = money.filter((m) => participants.some((p) => p.id === m.participant_id));
    const totals = calculateEventTotals(participants, movements);
    const cost = expenses
      .filter((e) => e.event_id === event.id)
      .reduce((s, e) => s.plus(e.amount), new Money(0))
      .toFixed(2);
    const wallets = {
      jesica: { cash: '0.00', transfer: '0.00', total: '0.00' },
      hernan: { cash: '0.00', transfer: '0.00', total: '0.00' },
    };
    const validCommercial =
      event.status === 'cancelled'
        ? []
        : commercialCollections(
            movements.filter((m) =>
              participants.some((p) => p.id === m.participant_id && p.active),
            ),
          );
    for (const m of validCommercial) {
      const w = wallets[m.recipient];
      w[m.method] = new Money(w[m.method]).plus(m.amount).toFixed(2);
      w.total = new Money(w.total).plus(m.amount).toFixed(2);
    }
    const history = typeof event.history === 'string' ? JSON.parse(event.history) : event.history;
    const cancellation = history.findLast(
      (h: any) =>
        h.action === 'delete' || (h.action === 'status' && h.changes?.after === 'cancelled'),
    );
    const { history: _history, ...identity } = event;
    const eligible =
      event.status === 'cancelled'
        ? []
        : movements.filter(
            (m) => !m.voided_at && participants.some((p) => p.id === m.participant_id && p.active),
          );
    const amount = (rows: EventMovement[], kind: EventMovement['kind']) =>
      rows
        .filter((m) => m.kind === kind)
        .reduce((s, m) => s.plus(m.amount), new Money(0))
        .toFixed(2);
    const valid = movements.filter((m) => !m.voided_at),
      voided = movements.filter((m) => !!m.voided_at);
    const administrative = voided.filter(
      (m) =>
        m.void_reason === 'Eliminación de inscripción con devolución administrativa' ||
        m.void_reason === 'Baja de inscripción anterior',
    );
    const excluded = valid.filter((m) => !eligible.includes(m));
    return {
      ...identity,
      recorded: {
        administratively_excluded_collections: amount(administrative, 'collection'),
        administratively_excluded_refunds: amount(administrative, 'refund'),
        collections: amount(movements, 'collection'),
        refunds: amount(movements, 'refund'),
        voided_collections: amount(voided, 'collection'),
        voided_refunds: amount(voided, 'refund'),
        excluded_valid_net: new Money(amount(excluded, 'collection'))
          .minus(amount(excluded, 'refund'))
          .toFixed(2),
      },
      cancelled_at: event.status === 'cancelled' ? (cancellation?.at ?? null) : null,
      cancelled_participants:
        event.status === 'cancelled'
          ? (cancellation?.changes?.participant_count ??
            cancellation?.changes?.retired_participant_ids?.length ??
            0)
          : null,
      cancellation_reason:
        event.status === 'cancelled' ? (cancellation?.changes?.reason ?? '') : null,
      wallets,
      active_count: event.status === 'cancelled' ? 0 : totals.active_count,
      registered_count: participants.length,
      withdrawn_count: participants.filter((p) => !p.active).length,
      collections: amount(eligible, 'collection'),
      refunds: amount(eligible, 'refund'),
      effective_net: event.status === 'cancelled' ? '0.00' : totals.gross,
      direct_expenses: cost,
      commercial:
        event.status === 'cancelled'
          ? null
          : {
              due: totals.due,
              balance: new Money(totals.due).minus(totals.gross).toFixed(2),
              gross: totals.gross,
              pending: totals.pending,
              result: new Money(totals.gross).minus(cost).toFixed(2),
            },
    };
  });
  const sum = (field: 'gross' | 'pending' | 'result') =>
    rows.reduce((s, r) => s.plus(r.commercial?.[field] ?? 0), new Money(0)).toFixed(2);
  const income = (await readIncomeSources(periodId, db)).income;
  const total = (field: 'collections' | 'refunds' | 'effective_net') =>
    rows.reduce((s, r) => s.plus(r[field]), new Money(0));
  if (
    !total('collections').eq(income.event_collections) ||
    !total('refunds').eq(income.event_refunds) ||
    !total('effective_net').eq(income.events) ||
    rows.some((r) => !new Money(r.collections).minus(r.refunds).eq(r.effective_net))
  )
    throw new Error('No se pudieron conciliar los ingresos de Eventos.');
  return eventEconomySchema.parse({
    version: '1.0',
    period,
    as_of: new Date().toISOString(),
    time_axis: 'economic_period',
    currency: 'ARS',
    income,
    event_expenses: expenses.reduce((s, r) => s.plus(r.amount), new Money(0)).toFixed(2),
    commercial_gross: sum('gross'),
    commercial_pending: sum('pending'),
    commercial_result: sum('result'),
    events: rows,
    warnings: [
      'collections/refunds son movimientos vigentes elegibles comercialmente, antes de su neteo. Suman los campos homónimos de income. recorded describe importes actuales de registros conservados, incluidos anulados: no reconstruye caja ni versiones anteriores a ediciones. Las exclusiones administrativas no son reintegros reales.',
      'Carteras representan recaudación comercial vigente atribuida a los cobros originales; no son saldos bancarios.',
      'Cancelados y participaciones eliminadas se excluyen. Deducciones históricas se aplican por orden estable de cobro, sin usar la cartera de devolución.',
      'Gastos asociados son parte de Gastos Período, no un gasto adicional al total.',
      'Resultado comercial directo estimado sobre gastos registrados; no es beneficio neto ni caja.',
      'Se conservan fechas efectivas; la imputación corresponde al período del evento.',
      'Los gastos registrados no acreditan pago ni carga completa.',
    ],
  });
}
