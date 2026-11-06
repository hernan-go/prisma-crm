// Synthetic browser fixture. No server/DB calls; unknown requests fail closed.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../client/App';
import { Decimal } from 'decimal.js';
import {
  calculateEventTotals,
  commercialCollections,
  type EventMovement,
  type EventParticipant,
} from '../../shared/special-events';
import '../../client/styles.css';

const periods = [
  { id: 1, year: 2026, month: 11, status: 'open' },
  { id: 2, year: 2026, month: 12, status: 'open' },
  { id: 3, year: 2026, month: 10, status: 'closed' },
];
const people = [
  { id: 1, nombre: 'Ana', apellido: 'Ficticia', telefono: '', activo: 1 },
  { id: 2, nombre: 'Luis', apellido: 'Prueba', telefono: '', activo: 1 },
];
const participants: EventParticipant[] = [
  { id: 1, event_id: 1, person_id: 1, price: '100.00', active: 1, notes: '' },
];
const movements: EventMovement[] = [];
const events = [
  {
    id: 1,
    event_number: 1,
    location: 'Sala PRISMA',
    period_id: 1,
    name: 'Charla de bienestar',
    description: 'Encuentro de prueba con datos sintéticos.',
    date: '2026-11-12',
    start_time: '18:00',
    end_time: '20:00',
    price: '100.00',
    capacity: 10,
    status: 'confirmed',
    notes: 'Invitaciones y precios individuales acordados por administración.',
    revision: 1,
    history: [] as {
      action: string;
      at: string;
      actor: string;
      result: { id: number; revision: number };
    }[],
  },
];
events.push({
  ...events[0],
  id: 2,
  event_number: 2,
  name: 'Encuentro creativo',
  price: '50.00',
  history: [],
});
participants.push({ id: 2, event_id: 2, person_id: 2, price: '50.00', active: 1, notes: '' });
movements.push(
  {
    id: 1,
    participant_id: 1,
    kind: 'collection',
    date: '2026-10-28',
    amount: '25.10',
    recipient: 'jesica',
    method: 'transfer',
    notes: 'Anticipo QA',
    voided_at: null,
    void_reason: null,
  },
  {
    id: 2,
    participant_id: 2,
    kind: 'collection',
    date: '2026-10-29',
    amount: '10.00',
    recipient: 'hernan',
    method: 'cash',
    notes: 'QA',
    voided_at: null,
    void_reason: null,
  },
);
const emptyWallets = () => ({
  jesica: { cash: '0.00', transfer: '0.00', total: '0.00' },
  hernan: { cash: '0.00', transfer: '0.00', total: '0.00' },
});
const receipts = new Map<string, { hash: string; result: { id: number; revision: number } }>();
let failResponse = false,
  conflict = false;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (resource, init) => {
  const path = new URL(String(resource), location.origin),
    method = init?.method ?? 'GET',
    body = init?.body ? JSON.parse(String(init.body)) : {};
  if (path.pathname === '/api/weather')
    return json({
      weather: {
        temperature: 28,
        symbol: 'partlycloudy_day',
        forecastAt: new Date().toISOString(),
        validUntil: new Date(Date.now() + 3600000).toISOString(),
        updatedAt: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    });
  if (path.pathname === '/api/agenda') return json([]);
  if (path.pathname === '/api/statistics/activity-enrollments')
    return json([
      { name: 'Yoga', count: 9 },
      { name: 'Informática', count: 6 },
    ]);
  if (path.pathname === '/api/dashboard') {
    const rows = events
      .filter(
        (e) =>
          e.period_id === Number(path.searchParams.get('period_id')) && e.status !== 'cancelled',
      )
      .map((e) => {
        const own = participants.filter((p) => p.event_id === e.id),
          all = movements.filter((m) => own.some((p) => p.id === m.participant_id)),
          totals = calculateEventTotals(own, all),
          wallets = emptyWallets();
        for (const m of commercialCollections(
          all.filter((m) => own.some((p) => p.id === m.participant_id && p.active)),
        )) {
          const w = wallets[m.recipient];
          w[m.method] = new Decimal(w[m.method]).plus(m.amount).toFixed(2);
          w.total = new Decimal(w.total).plus(m.amount).toFixed(2);
        }
        return {
          ...e,
          active_count: totals.active_count,
          commercial: {
            due: totals.due,
            gross: totals.gross,
            balance: new Decimal(totals.due).minus(totals.gross).toFixed(2),
          },
          wallets,
        };
      });
    const total = rows.reduce((sum, e) => sum.plus(e.commercial.gross), new Decimal(0));
    const wallets = emptyWallets();
    wallets.jesica = { cash: '100.00', transfer: '0.00', total: '100.00' };
    return json({
      people: 4,
      enrollments: 6,
      due: '200.00',
      paid: '100.00',
      pending: '100.00',
      credit: '0.00',
      undefined_accounts: 0,
      wallets,
      income_sources: {
        workshops: '100.00',
        events: total.toFixed(2),
        total: total.plus(100).toFixed(2),
      },
      events: rows,
    });
  }
  if (path.pathname === '/api/periods') return json(periods);
  if (path.pathname === '/api/people/matches') return json([]);
  if (path.pathname === '/api/people') {
    if (method === 'GET')
      return json({
        rows: people.filter((p) =>
          `${p.nombre} ${p.apellido}`
            .toLowerCase()
            .includes((path.searchParams.get('q') ?? '').toLowerCase()),
        ),
        total: people.length,
      });
    const person = { ...body, id: people.length + 1, activo: 1 };
    people.push(person);
    return json({ id: person.id }, 201);
  }
  if (!path.pathname.startsWith('/api/special-events'))
    return json({ message: 'Fixture bloqueó solicitud no prevista' }, 404);
  const parts = path.pathname.split('/').filter(Boolean),
    id = Number(parts[2]);
  if (method === 'GET') {
    if (parts.length === 2)
      return json(
        events.filter(
          (e) =>
            e.period_id === Number(path.searchParams.get('period_id')) &&
            (e.status !== 'cancelled' || path.searchParams.get('include_cancelled') === 'true'),
        ),
      );
    if (parts[3] === 'deletion-preview')
      return json({ reopen_periods: [{ id: 3, year: 2026, month: 10 }] });
    const event = events.find((e) => e.id === id);
    if (!event) return json({ message: 'Evento inexistente' }, 404);
    const own = participants
      .filter((p) => p.event_id === id)
      .map((p) => ({ ...p, ...people.find((pe) => pe.id === p.person_id), id: p.id }));
    const all = movements.filter((m) => own.some((p) => p.id === m.participant_id));
    const totals = calculateEventTotals(own, all);
    return json({
      ...event,
      ...totals,
      direct_expenses: '15.00',
      commercial_net: new Decimal(totals.gross).minus('15.00').toFixed(2),
      expenses: [
        {
          id: 1,
          category_id: 1,
          category_name: 'Adicionales sintéticos',
          period_id: event.period_id,
          concept: 'Té y masitas (QA)',
          date: '2026-11-10',
          amount: '15.00',
          notes: '',
          special_event_id: event.id,
        },
      ],
      movements: all,
      available: event.capacity === null ? null : event.capacity - totals.active_count,
    });
  }
  const hash = JSON.stringify([path.pathname, method, body]),
    old = receipts.get(body.request_id);
  if (old)
    return old.hash === hash ? json(old.result) : json({ message: 'Clave reutilizada' }, 409);
  let event = events.find((e) => e.id === id),
    resultId = id;
  if (parts.length === 2) {
    event = {
      ...body,
      id: events.length + 1,
      event_number: events.length + 1,
      status: 'draft',
      revision: 0,
      history: [],
    };
    events.push(event!);
    resultId = event!.id;
  } else {
    if (!event) return json({ message: 'No encontrado' }, 404);
    if (conflict) {
      conflict = false;
      event.revision++;
      return json({ message: 'El evento cambió. Volvé a consultarlo.' }, 409);
    }
    if (event.revision !== body.expected_revision)
      return json({ message: 'Revisión obsoleta' }, 409);
    if (periods.find((p) => p.id === event!.period_id)?.status === 'closed')
      return json({ message: 'Período cerrado' }, 409);
    if (parts[3] === 'delete' || parts[3] === 'status') {
      event.status = parts[3] === 'delete' ? 'cancelled' : body.status;
      if (event.status === 'cancelled')
        participants
          .filter((p) => p.event_id === id)
          .forEach((p) => {
            p.active = 0;
          });
    } else if (parts[3] === 'reschedule')
      Object.assign(event, {
        period_id: body.period_id,
        date: body.date,
        start_time: body.start_time,
        end_time: body.end_time,
      });
    else if (parts[3] === 'participants') {
      if (parts[5] === 'movements') {
        resultId = movements.length + 1;
        movements.push({
          ...body,
          id: resultId,
          participant_id: Number(parts[4]),
          voided_at: null,
          void_reason: null,
        });
      } else if (method === 'PATCH') {
        const p = participants.find((p) => p.id === Number(parts[4]));
        if (!p) return json({}, 404);
        Object.assign(p, { price: body.price, active: Number(body.active), notes: body.notes });
        if (!p.active)
          movements
            .filter((m) => m.participant_id === p.id)
            .forEach((m) => {
              m.voided_at = new Date().toISOString();
              m.void_reason = 'Baja QA';
            });
        resultId = p.id;
      } else {
        resultId = participants.length + 1;
        participants.push({ ...body, id: resultId, event_id: id, active: 1 });
      }
    } else if (parts[3] === 'movements') {
      const m = movements.find((m) => m.id === Number(parts[4]));
      if (!m) return json({}, 404);
      if (method === 'PATCH') Object.assign(m, body);
      else {
        m.voided_at = new Date().toISOString();
        m.void_reason = body.reason;
      }
      resultId = m.id;
    } else Object.assign(event, { ...body });
  }
  event!.revision++;
  const result = { id: resultId, revision: event!.revision };
  event!.history.push({
    action: parts[3] ?? 'edit',
    at: new Date().toISOString(),
    actor: 'administration',
    result,
  });
  receipts.set(body.request_id, { hash, result });
  if (failResponse) {
    failResponse = false;
    throw new TypeError('Respuesta perdida después de guardar');
  }
  return json(result, 201);
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 20000, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <div className="info">
      QA sintética · Sin conexión DB{' '}
      <button
        onClick={() => {
          failResponse = true;
        }}
      >
        Perder próxima respuesta
      </button>
      <button
        onClick={() => {
          conflict = true;
        }}
      >
        Simular conflicto
      </button>
      <button
        onClick={() => {
          periods[0].status = periods[0].status === 'open' ? 'closed' : 'open';
          void client.invalidateQueries();
        }}
      >
        Cerrar / reabrir noviembre
      </button>
    </div>
    <MemoryRouter initialEntries={['/eventos']}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
