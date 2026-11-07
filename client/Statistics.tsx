import { useQuery } from '@tanstack/react-query';
import {
  Wallet,
  Receipt,
  Coins,
  CircleDollarSign,
  Clock3,
  TrendingUp,
  Info,
  Plus,
} from 'lucide-react';
import { lazy, Suspense, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { StatisticsEvents } from './StatisticsEvents';
import { usePeriod, periodName } from './App';
import { PageHeading, Loading, ErrorBox, Empty, Modal, useDisclosure } from './components';
import {
  statisticsMoney,
  type StatisticMetric,
  type StatisticsSummary,
  type StatisticsExpenseBreakdown,
} from '../shared/statistics';
import {
  inflationResponseSchema,
  inflationMonth,
  inflationRate,
  type InflationResponse,
} from '../shared/inflation';
import './statistics.css';
import './dashboard.css';
import { expenseQueryOptions } from './statistics-expenses';
import { statisticsSummaryQueryOptions } from './statistics-collections';
import { StatisticsAccordion } from './StatisticsAccordion';
import { SkeletonRegion } from './Skeleton';
import { StatisticsChartSkeleton, StatisticsValueSkeleton } from './StatisticsSkeleton';

const StatisticsAnnual = lazy(() => import('./StatisticsAnnual'));
const StatisticsExpenseChart = lazy(() => import('./StatisticsExpenseChart'));
const StatisticsCollectionsChart = lazy(() => import('./StatisticsCollectionsChart'));
const StatisticsFeesChart = lazy(() =>
  import('./StatisticsFeesChart').then((module) => ({ default: module.StatisticsFeesChart })),
);

export { statisticsKey } from './statistics-collections';
export const inflationKey = ['statistics-inflation'] as const;
export { statisticsExpenseKey } from './statistics-expenses';

function ExpenseBreakdown({
  open,
  close,
  period,
  metric,
}: {
  open: boolean;
  close: () => void;
  period: number;
  metric: StatisticMetric;
}) {
  const breakdown = useQuery({
    ...expenseQueryOptions(period),
    enabled: open,
  });
  const data = breakdown.data;
  const reconciles = data?.total === metric.value && data?.movement_count === metric.universe;
  const group = (title: string, value: StatisticsExpenseBreakdown['recurring']) => (
    <section className="statistics-expense-group">
      <h3>{title}</h3>
      {value.categories.length ? (
        <>
          <ul>
            {value.categories.map((category) => (
              <li key={category.category_id}>
                <span>
                  {category.recurring_concept_name ?? category.category_name}
                  {category.recurring_concept_name &&
                  category.category_name !== category.recurring_concept_name
                    ? ` · ${category.category_name}`
                    : ''}
                  <small>
                    {category.movement_count}{' '}
                    {category.movement_count === 1 ? 'movimiento' : 'movimientos'}
                  </small>
                </span>
                <b>{statisticsMoney(category.amount)}</b>
              </li>
            ))}
          </ul>
          <p>
            Subtotal · {statisticsMoney(value.subtotal)} ({value.movement_count}{' '}
            {value.movement_count === 1 ? 'movimiento' : 'movimientos'})
          </p>
        </>
      ) : (
        <p>Sin movimientos registrados.</p>
      )}
    </section>
  );
  if (!open) return null;
  return (
    <Modal title="Desglose de gastos registrados" close={close}>
      <p>Período seleccionado · importes registrados; el registro no acredita el pago.</p>
      {breakdown.isPending ? (
        <Loading />
      ) : breakdown.isError ? (
        <>
          <ErrorBox error={breakdown.error} />
          <button type="button" onClick={() => breakdown.refetch()}>
            Reintentar
          </button>
        </>
      ) : data ? (
        <>
          {!reconciles && (
            <div role="status" className="statistics-warning">
              El desglose se está actualizando para reconciliar con el indicador.
            </div>
          )}
          {group('Recurrentes', data.recurring)}
          {group('Adicionales', data.additional)}
          <p className="statistics-expense-total">
            <b>
              Total · {statisticsMoney(data.total)} ({data.movement_count}{' '}
              {data.movement_count === 1 ? 'movimiento' : 'movimientos'})
            </b>
          </p>
          {!reconciles && (
            <button type="button" onClick={() => void breakdown.refetch()}>
              Actualizar desglose
            </button>
          )}
        </>
      ) : null}
    </Modal>
  );
}
function Amount({ metric, label }: { metric: StatisticMetric; label?: string }) {
  return (
    <>
      <p className="statistics-value">
        {metric.coverage === 'undefined' ? 'Sin definir' : statisticsMoney(metric.value)}
      </p>
      {(label || metric.coverage !== 'complete') && (
        <p
          className={`statistics-coverage ${metric.coverage === 'partial' || metric.coverage === 'undefined' ? 'statistics-warning' : ''}`}
        >
          {[
            label,
            metric.coverage === 'empty'
              ? 'Sin registros'
              : metric.coverage === 'partial'
                ? 'Total parcial'
                : metric.coverage === 'undefined'
                  ? 'Faltan importes'
                  : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </>
  );
}
function Coverage({ metric, unit }: { metric: StatisticMetric; unit: string }) {
  return (
    <>
      <p>
        {metric.defined} de {metric.universe} {unit} con importe registrado.
      </p>
      {metric.missing > 0 && <p>{metric.missing} todavía sin registro de importe.</p>}
      {metric.undefined > 0 && (
        <p>
          {metric.undefined}{' '}
          {metric.undefined === 1
            ? 'cuenta con importe sin registrar'
            : 'cuentas con importe sin registrar'}
          .
        </p>
      )}
      {(metric.coverage === 'partial' || metric.coverage === 'undefined') && (
        <p>
          El total es parcial: incluye únicamente los importes registrados, sin estimar los
          faltantes.
        </p>
      )}
    </>
  );
}
export function StatisticsInfo({ title, children }: { title: string; children: ReactNode }) {
  const { open, setOpen, root, trigger, id } = useDisclosure();
  const panel = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const fit = () => {
      const rect = panel.current!.getBoundingClientRect();
      setOffset(
        (previous) =>
          previous + Math.max(12 - rect.left, Math.min(0, window.innerWidth - 12 - rect.right)),
      );
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open]);
  return (
    <div className="statistics-info" ref={root}>
      <button
        ref={trigger}
        type="button"
        aria-label={`Información de ${title}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          className="statistics-info-panel"
          style={{ transform: `translateX(${offset}px)` }}
          role="region"
          aria-label={`Información de ${title}`}
        >
          <strong>{title}</strong>
          {children}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            Cerrar información
          </button>
        </div>
      )}
    </div>
  );
}
function Card({
  title,
  icon,
  tone,
  info,
  children,
}: {
  title: string;
  icon: ReactNode;
  tone: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={`statistics-card statistics-${tone}`}>
      <div className="statistics-card-header">
        <h2>
          <span aria-hidden="true">{icon}</span>
          {title}
        </h2>
        {info && <StatisticsInfo title={title}>{info}</StatisticsInfo>}
      </div>
      {children}
    </article>
  );
}
export function InflationTile({
  data,
  error,
  loading,
}: {
  data?: InflationResponse;
  error?: boolean;
  loading?: boolean;
}) {
  const value = data?.snapshot;
  return (
    <Card
      title="Inflación · IPC"
      icon={<TrendingUp size={18} />}
      tone="inflation"
      info={
        <>
          <p>
            IPC nacional, nivel general. Se muestra el último dato oficial disponible, independiente
            del período económico seleccionado.
          </p>
          {value && (
            <>
              <dl className="statistics-breakdown">
                <div>
                  <dt>Acumulado anual</dt>
                  <dd>{inflationRate(value.year_to_date)}</dd>
                </div>
                <div>
                  <dt>Interanual</dt>
                  <dd>{inflationRate(value.year_over_year)}</dd>
                </div>
              </dl>
              <p>Referencia: {inflationMonth(value.reference_period)}.</p>
              <p>Publicado: {value.published_at.split('-').reverse().join('/')}.</p>
              <p>Verificado: {value.verified_at.split('-').reverse().join('/')}.</p>
              <p>
                Fuente:{' '}
                <a href={value.source_url} target="_blank" rel="noreferrer">
                  {value.source}
                </a>
                .{' '}
                <a href={value.series_url} target="_blank" rel="noreferrer">
                  Serie oficial
                </a>
                .
              </p>
            </>
          )}
          <p>
            El dato más reciente puede corresponder al mes anterior al actual. No es una proyección
            ni una medición exacta de los costos del negocio.
          </p>
          {(data?.status === 'fallback' || error) && (
            <p>
              No se pudo confirmar una actualización. Se conserva el último valor verificado;
              consultar su mes y fecha.
            </p>
          )}
        </>
      }
    >
      {value ? (
        <>
          <p className="statistics-value">{inflationRate(value.monthly)}</p>
          <p className="statistics-coverage">Mensual · {inflationMonth(value.reference_period)}</p>
          {(data.status === 'fallback' || error) && (
            <p className="statistics-warning statistics-notice">
              Último verificado · sin actualización confirmada
            </p>
          )}
        </>
      ) : loading ? (
        <SkeletonRegion label="Consultando IPC oficial…">
          <StatisticsValueSkeleton />
        </SkeletonRegion>
      ) : (
        <p className="statistics-unavailable" role="status">
          No se pudo consultar el IPC. Reintentaremos automáticamente.
        </p>
      )}
    </Card>
  );
}
export function ExecutiveSummary({
  data,
  inflation,
  inflationError,
  inflationLoading,
}: {
  data: StatisticsSummary;
  inflation?: InflationResponse;
  inflationError?: boolean;
  inflationLoading?: boolean;
}) {
  const m = data.metrics;
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false);
  return (
    <>
      <div className="statistics-grid">
        <Card
          title="Total a cobrar"
          icon={<CircleDollarSign size={18} />}
          tone="income"
          info={
            <>
              <p>
                Total de los importes a cobrar registrados en las cuentas del período. Cero es un
                importe registrado; los importes faltantes no se suponen iguales a cero.
              </p>
              <Coverage metric={m.due} unit="personas" />
            </>
          }
        >
          <Amount metric={m.due} />
        </Card>
        <Card
          title="Cobrado"
          icon={<Wallet size={18} />}
          tone="collected"
          info={
            <>
              <p>
                Cobros aplicados a las cuentas de este período, aunque se hayan recibido en otro
                mes.
              </p>
              <p>
                {m.collected.universe}{' '}
                {m.collected.universe === 1 ? 'movimiento registrado' : 'movimientos registrados'}.
              </p>
            </>
          }
        >
          <Amount metric={m.collected} />
        </Card>
        <Card
          title="Falta cobrar"
          icon={<Clock3 size={18} />}
          tone="debt"
          info={
            <>
              <p>
                Importes que faltan cobrar en las cuentas con importe registrado. Los saldos a favor
                no compensan deudas de otras personas.
              </p>
              <Coverage metric={m.debt} unit="personas" />
              <p>
                Saldos a favor:{' '}
                {m.credit.coverage === 'undefined'
                  ? 'Sin definir'
                  : statisticsMoney(m.credit.value)}
                .
              </p>
            </>
          }
        >
          <Amount metric={m.debt} />
        </Card>
        <Card
          title="Honorarios"
          icon={<Coins size={18} />}
          tone="fees"
          info={
            <>
              <p>
                Honorarios de facilitadores: importe a pagar por prestación pactada, sin multiplicar
                por horarios ni inscripciones. Pagos imputados al período económico, aunque su fecha
                sea de otro mes.
              </p>
              <dl className="statistics-breakdown">
                <div>
                  <dt>Pagado</dt>
                  <dd>{statisticsMoney(m.fees_paid.value)}</dd>
                </div>
                <div>
                  <dt>Falta pagar · importes registrados</dt>
                  <dd>
                    {m.fees_pending.coverage === 'undefined'
                      ? 'Sin definir'
                      : statisticsMoney(m.fees_pending.value)}
                  </dd>
                </div>
              </dl>
              <Coverage metric={m.fees_committed} unit="acuerdos de honorarios" />
              {data.fees_overpaid.count > 0 && (
                <p>
                  {data.fees_overpaid.count}{' '}
                  {data.fees_overpaid.count === 1
                    ? 'compromiso con pagos superiores'
                    : 'compromisos con pagos superiores'}{' '}
                  al importe actual: {statisticsMoney(data.fees_overpaid.excess)} de diferencia. No
                  se considera crédito.
                </p>
              )}
            </>
          }
        >
          <Amount metric={m.fees_committed} label="A pagar" />
          {data.fees_overpaid.count > 0 && (
            <p className="statistics-warning statistics-notice">
              Pagos superiores al compromiso · ver información
            </p>
          )}
        </Card>
        <Card
          title="Gastos registrados"
          icon={<Receipt size={18} />}
          tone="expenses"
          info={
            <>
              <p>
                Gastos de las categorías del período. El registro no acredita su pago. Honorarios se
                informan por separado.
              </p>
              <p>
                {m.expenses.universe}{' '}
                {m.expenses.universe === 1 ? 'gasto registrado' : 'gastos registrados'}.
              </p>
              <button type="button" onClick={() => setShowExpenseBreakdown(true)}>
                Ver desglose
              </button>
            </>
          }
        >
          <Amount metric={m.expenses} />
        </Card>
        <InflationTile data={inflation} error={inflationError} loading={inflationLoading} />
      </div>
      {data.empty && (
        <Empty>
          Este período no tiene miembros, compromisos de honorarios ni gastos registrados.
        </Empty>
      )}
      <ExpenseBreakdown
        open={showExpenseBreakdown}
        close={() => setShowExpenseBreakdown(false)}
        period={data.period.id}
        metric={m.expenses}
      />
      <p className="statistics-footnote">
        Lectura del {new Date(data.as_of).toLocaleString('es-AR')}. Los totales reflejan registros
        actuales; no representan ganancia neta.
      </p>
    </>
  );
}
function ActivityEnrollments({ period }: { period: number }) {
  const q = useQuery({
    queryKey: ['activity-enrollments', period],
    queryFn: () =>
      api<{ name: string; count: number }[]>(
        '/statistics/activity-enrollments?period_id=' + period,
      ),
    enabled: !!period,
  });
  const maximum = Math.max(1, ...(q.data ?? []).map((a) => a.count));
  return (
    <section className="expense-analysis-tile statistics-enrollments">
      <p className="statistics-panel-note">
        Una persona puede inscribirse en varias actividades. No representa asistencia ni ocupación
        de cupos.
      </p>
      {q.error && (
        <div role="alert">
          <ErrorBox error={q.error} />
          <button type="button" onClick={() => void q.refetch()}>
            Reintentar inscripciones
          </button>
        </div>
      )}
      {q.isPending && (
        <SkeletonRegion label="Cargando inscripciones…">
          <StatisticsValueSkeleton />
        </SkeletonRegion>
      )}
      {q.data?.map((a, index) => (
        <div className="activity-count" key={index}>
          <div>
            <span>{a.name}</span>
            <b>{a.count}</b>
          </div>
          <div className="track" aria-hidden="true">
            <i style={{ width: Math.max(0, (a.count / maximum) * 100) + '%' }} />
          </div>
        </div>
      ))}
      {q.data?.length === 0 && <Empty>Sin actividades en este período.</Empty>}
    </section>
  );
}
export function Statistics() {
  const { period, periods, selectPeriod, createPeriod } = usePeriod();
  const [view, setView] = useState<'monthly' | 'annual'>('monthly');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [feesOpen, setFeesOpen] = useState(false);
  const [enrollmentsOpen, setEnrollmentsOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const selected = periods.find((p) => p.id === period);
  const years = [...new Set<number>(periods.map((p) => Number(p.year)))].sort((a, b) => b - a);
  const year = selectedYear ?? selected?.year ?? years[0] ?? new Date().getFullYear();
  if (!years.includes(year)) years.push(year);
  const summary = useQuery({
    ...statisticsSummaryQueryOptions(period),
    enabled: Boolean(period) && view === 'monthly',
  });
  const inflation = useQuery({
    queryKey: inflationKey,
    enabled: Boolean(period) && view === 'monthly',
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    queryFn: async () => inflationResponseSchema.parse(await api('/statistics/inflation')),
  });
  const data = summary.data?.period.id === period ? summary.data : undefined;
  return (
    <section
      className="statistics-page"
      aria-label={
        view === 'annual'
          ? `Estadísticas anuales de ${year}`
          : `Estadísticas de ${periodName(data?.period ?? selected)}`
      }
    >
      <PageHeading title="Estadísticas" description={null} className="statistics-module-heading">
        <div className="statistics-context-controls">
          {view === 'monthly' ? (
            <label>
              Período
              <select
                aria-label="Período activo"
                value={period}
                onChange={(event) => selectPeriod?.(Number(event.target.value))}
              >
                <option value={0} disabled>
                  Seleccionar período
                </option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {periodName(p)}
                    {p.status === 'closed' ? ' · Cerrado' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Año
              <select
                aria-label="Año de estadísticas"
                value={year}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          {view === 'monthly' && createPeriod && (
            <button
              type="button"
              className="icon"
              title="Crear nuevo período"
              aria-label="Crear nuevo período"
              onClick={createPeriod}
            >
              <Plus size={18} />
            </button>
          )}
          {view === 'monthly' && period > 0 && (
            <span className="statistics-status">
              {(data?.period.status ?? selected?.status) === 'closed'
                ? 'Período cerrado · consulta histórica'
                : 'Período abierto · datos sujetos a cambios'}
            </span>
          )}
        </div>
      </PageHeading>
      <div className="statistics-view-controls" role="group" aria-label="Vista de estadísticas">
        <button type="button" aria-pressed={view === 'monthly'} onClick={() => setView('monthly')}>
          Resumen mensual
        </button>
        <button type="button" aria-pressed={view === 'annual'} onClick={() => setView('annual')}>
          Evolución anual
        </button>
      </div>
      {view === 'annual' ? (
        <Suspense
          fallback={
            <StatisticsChartSkeleton kind="collections" label="Cargando evolución anual…" />
          }
        >
          <StatisticsAnnual key={year} year={year} />
        </Suspense>
      ) : !period ? (
        <Empty>Creá un período para consultar sus estadísticas.</Empty>
      ) : summary.isError && !data ? (
        <div role="alert">
          <ErrorBox error={summary.error} />
          <button type="button" onClick={() => summary.refetch()}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {data ? (
            <ExecutiveSummary
              data={data}
              inflation={inflation.data}
              inflationError={inflation.isError}
              inflationLoading={inflation.isPending}
            />
          ) : (
            <>
              <span className="skeleton-status" role="status">
                Cargando estadísticas del período…
              </span>
              <div className="statistics-grid" aria-busy="true" aria-label="Resumen del período">
                {(
                  [
                    ['Total a cobrar', CircleDollarSign, 'income'],
                    ['Cobrado', Wallet, 'collected'],
                    ['Falta cobrar', Clock3, 'debt'],
                    ['Honorarios', Coins, 'fees'],
                    ['Gastos registrados', Receipt, 'expenses'],
                  ] as const
                ).map(([title, Icon, tone]) => (
                  <Card key={title} title={title} icon={<Icon size={18} />} tone={tone}>
                    <StatisticsValueSkeleton />
                  </Card>
                ))}
                <InflationTile
                  data={inflation.data}
                  error={inflation.isError}
                  loading={inflation.isPending}
                />
              </div>
              <div
                className="statistics-footnote statistics-skeleton-footnote"
                aria-hidden="true"
              />
            </>
          )}
          {data && summary.isFetching && (
            <p className="statistics-footnote" role="status">
              Actualizando estadísticas…
            </p>
          )}
          {data && summary.isError && (
            <div role="alert">
              <ErrorBox error={summary.error} />
              <button type="button" onClick={() => void summary.refetch()}>
                Reintentar
              </button>
            </div>
          )}
          <section className="statistics-analysis" aria-label="Análisis del período">
            <div className="statistics-monthly-grid">
              <StatisticsAccordion
                title="Ingresos y cobranzas"
                icon={<Wallet size={18} />}
                open={collectionsOpen}
                onToggle={() => setCollectionsOpen((value) => !value)}
              >
                <Suspense fallback={<StatisticsChartSkeleton kind="collections" />}>
                  {data ? (
                    <StatisticsCollectionsChart key={period} summary={data} />
                  ) : (
                    <StatisticsChartSkeleton kind="collections" />
                  )}
                </Suspense>
              </StatisticsAccordion>
              <StatisticsAccordion
                title="Inscripciones por actividad"
                icon={<CircleDollarSign size={18} />}
                open={enrollmentsOpen}
                onToggle={() => setEnrollmentsOpen((value) => !value)}
              >
                <ActivityEnrollments key={period} period={period} />
              </StatisticsAccordion>
              <StatisticsAccordion
                title="Gastos operativos"
                icon={<Receipt size={18} />}
                open={expensesOpen}
                onToggle={() => setExpensesOpen((value) => !value)}
              >
                <Suspense fallback={<StatisticsChartSkeleton kind="expenses" />}>
                  {data ? (
                    <StatisticsExpenseChart
                      key={period}
                      period={period}
                      metric={data.metrics.expenses}
                      refreshSummary={() => void summary.refetch()}
                    />
                  ) : (
                    <StatisticsChartSkeleton kind="expenses" />
                  )}
                </Suspense>
              </StatisticsAccordion>
              <StatisticsAccordion
                title="Honorarios"
                icon={<Coins size={18} />}
                open={feesOpen}
                onToggle={() => setFeesOpen((value) => !value)}
              >
                <Suspense fallback={<StatisticsChartSkeleton kind="fees" />}>
                  {data ? (
                    <StatisticsFeesChart
                      key={period}
                      summary={data}
                      refreshSummary={() => void summary.refetch()}
                    />
                  ) : (
                    <StatisticsChartSkeleton kind="fees" />
                  )}
                </Suspense>
              </StatisticsAccordion>
            </div>
            {data?.events && (
              <StatisticsAccordion
                title="Ingresos por origen y Eventos Especiales"
                icon={<Wallet size={18} />}
                open={eventsOpen}
                onToggle={() => setEventsOpen((value) => !value)}
              >
                <StatisticsEvents data={data.events} />
              </StatisticsAccordion>
            )}
          </section>
        </>
      )}
    </section>
  );
}
