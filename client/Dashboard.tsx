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
import {
  dashboardDate,
  dailySchedules,
  programmingTitle,
  type AgendaSchedule,
} from './dashboard-model';
import './dashboard.css';
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
export function FinancialSummary({ data: d }: { data: DashboardData }) {
  const maximum = Math.max(1, ...d.activities.map((a) => a.count));
  return (
    <>
      <div className="stats dashboard-stats">
        {[
          ['Total inscriptos período', d.people, dashboardHelp[0]],
          ['Inscripciones en actividades', d.enrollments, dashboardHelp[1]],
          ['Total a cobrar', formatMoney(d.due)],
          ['Total cobrado', formatMoney(d.paid)],
        ].map(([label, value, help]) => (
          <article className="stat" key={label}>
            <div className="dashboard-metric-title">
              <span>{label}</span>
              {help && <MetricHelp title={String(label)} text={String(help)} />}
            </div>
            <strong className={help ? '' : 'dashboard-money'}>{value}</strong>
            <small>Período seleccionado</small>
          </article>
        ))}
      </div>
      <div className="dashboard-finances">
        <section className="panel">
          <h2>Carteras del mes</h2>
          {(['jesica', 'hernan'] as const).map((recipient) => (
            <div key={recipient} className="wallet">
              <span className="wallet-icon">
                <Wallet size={21} />
              </span>
              <div>
                <b>{recipientLabel(recipient)}</b>
                <small>Efectivo: {formatMoney(d.wallets[recipient].cash)}</small>
                <small>Transferencia: {formatMoney(d.wallets[recipient].transfer)}</small>
                <small>
                  <b>Total: {formatMoney(d.wallets[recipient].total)}</b>
                </small>
              </div>
            </div>
          ))}
        </section>
        <section className="panel balance-panel">
          <h2>Saldos del mes</h2>
          <strong className="dashboard-balance">{formatMoney(d.pending)}</strong>
          <p>Pendiente de cobro</p>
          <small>Saldo a favor: {formatMoney(d.credit)}</small>
          {Number(d.undefined_accounts) > 0 && (
            <p className="info">{d.undefined_accounts} cuentas con importe a cobrar no definido.</p>
          )}
          <Link to="/pagos">Ver cuentas y movimientos →</Link>
        </section>
      </div>
      <section className="panel dashboard-chart">
        <div className="section-heading">
          <h2>Inscripciones por actividad</h2>
          <span className="chip">{d.activities.length} actividades</span>
        </div>
        {d.activities.map((a, index) => (
          <div className="activity-count" key={`${a.name}-${index}`}>
            <div>
              <span>{a.name}</span>
              <b>{a.count}</b>
            </div>
            <div className="track" aria-hidden="true">
              <i style={{ width: `${Math.max(0, (a.count / maximum) * 100)}%` }} />
            </div>
          </div>
        ))}
        {!d.activities.length && <Empty>Sin actividades en este período.</Empty>}
      </section>
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
  const schedules = dailySchedules(agenda.data || [], period, date.day);
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
                  {selected && programmingTitle(selected, now) === 'Actividades de hoy' ? (
                    <>
                      Actividades <span>{date.weekday}</span>
                    </>
                  ) : selected ? (
                    programmingTitle(selected, now)
                  ) : (
                    'Programación del día'
                  )}
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
