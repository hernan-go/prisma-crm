import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Wallet, Clock3, CalendarDays } from 'lucide-react';
import { api } from './api';
import { usePeriod, periodName } from './App';
import { Empty, PageHeading, useDisclosure } from './components';
import { QueryFeedback } from './LoadingViews';
import { DashboardAgendaSkeleton, DashboardFinanceSkeleton } from './DashboardSkeleton';
import { formatMoney, recipientLabel, type PeriodWallets } from '../shared/domain';
import { dashboardDate, dailySchedules, type AgendaSchedule } from './dashboard-model';
import './dashboard.css';
import type { EventEconomy } from '../shared/event-economy';
import { Weather } from './Weather';

type DashboardData = {
  people: number;
  enrollments: number;
  due: string;
  paid: string;
  pending: string;
  credit: string;
  undefined_accounts: number | null;
  wallets: PeriodWallets;
  income_sources?: { workshops: string; events: string; total?: string };
  events?: EventEconomy['events'];
  activities: { name: string; count: number }[];
};
export const dashboardHelp = [
  'Personas incorporadas al período seleccionado, tengan o no actividades asignadas. Pueden ser nuevas o existentes en la BBDD.',
  'Cantidad de inscripciones a talleres del período. Una persona puede estar inscripta en varias actividades y contabilizarse más de una vez.',
];
function MetricHelp({ title, text }: { title: string; text: string }) {
  const { open, setOpen, root, trigger, id } = useDisclosure();
  return (
    <div className="dashboard-help" ref={root}>
      <button
        type="button"
        ref={trigger}
        aria-label={`Ayuda de ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <div
          id={id}
          className="dashboard-help-panel"
          role="region"
          aria-label={`Ayuda de ${title}`}
        >
          <p>{text}</p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            Cerrar ayuda
          </button>
        </div>
      )}
    </div>
  );
}
function useCurrentMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const next = new Date();
      setNow(next);
      timer = setTimeout(update, 60000 - (next.getTime() % 60000));
    };
    const visible = () => {
      if (document.visibilityState === 'visible') update();
    };
    update();
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return now;
}
function ScheduleCard({ schedule }: { schedule: AgendaSchedule }) {
  return (
    <article className="panel dashboard-schedule">
      <div className="dashboard-schedule-heading">
        <div>
          <span className="eyebrow">
            {schedule.start.slice(0, 5)}–{schedule.end.slice(0, 5)}
          </span>
          <h3>{schedule.activity}</h3>
          <p>
            {schedule.instructors.map((i) => i.name).join(' · ') || 'Sin facilitadores asignados'}
          </p>
        </div>
        <div className="dashboard-count">
          <span>Inscriptos</span>
          <b>{schedule.people.length}</b>
        </div>
      </div>
      <div className="dashboard-people">
        {schedule.people.length ? (
          <ul>
            {schedule.people.map((p) => (
              <li key={p.person_id}>
                <Link className="participant-name" to={`/personas/${p.person_id}`}>
                  {p.nombre} {p.apellido}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Sin personas inscriptas en este horario.</p>
        )}
      </div>
    </article>
  );
}
export function Wallets({ wallets }: { wallets: PeriodWallets }) {
  return (
    <>
      {(['jesica', 'hernan'] as const).map((recipient) => (
        <div key={recipient} className="wallet">
          <span className="wallet-icon">
            <Wallet size={21} />
          </span>
          <div>
            <b>{recipientLabel(recipient)}</b>
            <small>Efectivo: {formatMoney(wallets[recipient].cash)}</small>
            <small>Transferencia: {formatMoney(wallets[recipient].transfer)}</small>
            <small>
              <b>Subtotal: {formatMoney(wallets[recipient].total)}</b>
            </small>
          </div>
        </div>
      ))}
    </>
  );
}
export function EventFinance({ events }: { events: EventEconomy['events'] }) {
  const [selected, setSelected] = useState<number>();
  const current = events.find((e) => e.id === selected) ?? events[0];
  if (!current?.commercial) return null;
  return (
    <section className="panel dashboard-event-finance">
      <div className="section-heading">
        <h2>EVENTOS ESPECIALES</h2>
        <label className="event-dashboard-selector">
          Evento
          <select
            aria-label="Evento del resumen"
            value={current.id}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                EVENTO {e.event_number}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="badge">EVENTO {current.event_number}</span>
      <h3>{current.name}</h3>
      <div className="stats dashboard-three-stats">
        {[
          ['Participantes', current.active_count],
          ['Total a cobrar', formatMoney(current.commercial.due)],
          ['Total cobrado', formatMoney(current.commercial.gross)],
        ].map(([label, value]) => (
          <article className="stat" key={label}>
            <div className="dashboard-metric-title">
              <span>{label}</span>
            </div>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="dashboard-finances">
        <section className="panel">
          <h3>Cartera del evento</h3>
          <Wallets wallets={current.wallets} />
        </section>
        <section className="panel balance-panel">
          <h3>Saldo del evento</h3>
          <strong className="dashboard-balance">{formatMoney(current.commercial.balance)}</strong>
          <p>Total a cobrar − Total cobrado. Sin descontar gastos.</p>
        </section>
      </div>
    </section>
  );
}
export function FinancialSummary({ data: d }: { data: DashboardData }) {
  return (
    <>
      <section className="panel dashboard-total">
        <Wallet size={24} aria-hidden="true" />
        <div>
          <h2>TOTAL RECAUDADO</h2>
          <small>Talleres y actividades + Eventos Especiales</small>
        </div>
        <strong className="dashboard-balance">
          {formatMoney(d.income_sources?.total ?? d.paid)}
        </strong>
      </section>
      <section className="panel dashboard-workshops" aria-label="Talleres y actividades">
        <h2>TALLERES Y ACTIVIDADES</h2>
        <div className="stats dashboard-stats">
          {[
            ['Total inscriptos', d.people, dashboardHelp[0]],
            ['Inscripciones', d.enrollments, dashboardHelp[1]],
            ['Total a cobrar', formatMoney(d.due)],
            ['Total cobrado', formatMoney(d.paid)],
          ].map(([label, value, help]) => (
            <article className="stat" key={label}>
              <div className="dashboard-metric-title">
                <span>{label}</span>
                {help && <MetricHelp title={String(label)} text={String(help)} />}
              </div>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <div className="dashboard-finances">
          <section className="panel">
            <h2>Carteras del mes</h2>
            <Wallets wallets={d.wallets} />
          </section>
          <section className="panel balance-panel">
            <h2>Saldos del mes</h2>
            <strong className="dashboard-balance">{formatMoney(d.pending)}</strong>
            <p>Pendiente de cobro</p>
            <small>Saldo a favor: {formatMoney(d.credit)}</small>
            {Number(d.undefined_accounts) > 0 && (
              <p className="info">
                {d.undefined_accounts} cuentas con importe a cobrar no definido.
              </p>
            )}
            <Link to="/pagos">Ver cuentas y movimientos →</Link>
          </section>
        </div>
      </section>
      <EventFinance
        events={(d.events ?? [])
          .filter((e) => e.status !== 'cancelled')
          .sort((a, b) => a.event_number - b.event_number)}
      />
    </>
  );
}
export function Dashboard() {
  const { period, periods } = usePeriod();
  const selected = periods.find((p) => p.id === period);
  const now = useCurrentMinute();
  const date = dashboardDate(now);
  const finance = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => api<DashboardData>(`/dashboard?period_id=${period}`),
    enabled: !!period,
  });
  const agenda = useQuery({
    queryKey: ['agenda', period],
    queryFn: () => api<AgendaSchedule[]>(`/agenda?period_id=${period}`),
    enabled: !!period,
  });
  const [chosenDay, setChosenDay] = useState<number | null>(null);
  const day = chosenDay ?? (date.day || 1);
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const schedules = dailySchedules(agenda.data || [], period, day);
  return (
    <div className="dashboard">
      <PageHeading
        eyebrow="RESUMEN DEL ESPACIO"
        title="Dashboard"
        description={`Una mirada a ${periodName(selected) || 'tu espacio'}.`}
      >
        <Link className="button primary" to="/gestion">
          <Plus size={17} /> Nueva inscripción
        </Link>
      </PageHeading>
      <div className="dashboard-layout">
        <section className="dashboard-operation" aria-label="Programación diaria">
          <div className="dashboard-day-header">
            <div className="dashboard-day-tile">
              <Clock3 className="dashboard-day-desktop-icon" size={22} aria-hidden="true" />
              <CalendarDays className="dashboard-day-calendar-icon" size={22} aria-hidden="true" />
              <div>
                <h2>
                  {selected?.year === date.year &&
                  selected?.month === date.month &&
                  day === date.day
                    ? `Actividades de hoy · ${dayNames[day]}`
                    : `Programación · ${dayNames[day]}`}
                </h2>
                <p>{date.date}</p>
                {selected && (selected.year !== date.year || selected.month !== date.month) && (
                  <small>{periodName(selected)}</small>
                )}
              </div>
            </div>
            <div className="dashboard-clock">
              <span className="dashboard-time">
                <Clock3 className="dashboard-time-icon" size={20} aria-hidden="true" />
                <time dateTime={now.toISOString()}>{date.time}</time>
              </span>
              <Weather now={now} />
            </div>
          </div>
          <div className="dashboard-days" role="group" aria-label="Día de programación">
            {dayNames.slice(1).map((name, index) => (
              <button
                key={name}
                type="button"
                aria-pressed={day === index + 1}
                onClick={() => setChosenDay(index + 1)}
              >
                {name.toLocaleUpperCase('es')}
              </button>
            ))}
          </div>
          {!period ? (
            <Empty>Creá un período con el botón + para comenzar.</Empty>
          ) : (
            <>
              <QueryFeedback query={agenda} label="programación" />
              {agenda.isPending ? (
                <DashboardAgendaSkeleton />
              ) : agenda.data !== undefined ? (
                <>
                  {schedules.map((s) => (
                    <ScheduleCard key={`${period}-${date.day}-${s.id}`} schedule={s} />
                  ))}
                  {!schedules.length && (
                    <Empty>
                      No hay horarios habilitados para este día en el período seleccionado.
                    </Empty>
                  )}
                </>
              ) : null}
            </>
          )}
        </section>
        {!!period && (
          <section className="dashboard-administration" aria-label="Resumen del período">
            <QueryFeedback query={finance} label="resumen" />
            {finance.isPending ? (
              <DashboardFinanceSkeleton />
            ) : finance.data !== undefined ? (
              <FinancialSummary data={finance.data} />
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
