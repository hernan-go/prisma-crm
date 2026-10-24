import { useQuery } from '@tanstack/react-query';
import { Wallet, Receipt, Coins, CircleDollarSign, Clock3, TrendingUp, Info } from 'lucide-react';
import { lazy, Suspense, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { usePeriod, periodName } from './App';
import { PageHeading, Loading, ErrorBox, Empty, Modal, useDisclosure } from './components';
import {
  statisticsSummarySchema,
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
import { expenseQueryOptions } from './statistics-expenses';

const StatisticsExpenseChart = lazy(() => import('./StatisticsExpenseChart'));

export const statisticsKey = (period: number) => ['statistics-summary', period] as const;
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
      <p
        className={`statistics-coverage ${metric.coverage === 'partial' || metric.coverage === 'undefined' ? 'statistics-warning' : ''}`}
      >
        {label && `${label} · `}
        {metric.coverage === 'empty'
          ? 'Sin registros'
          : metric.coverage === 'partial'
            ? 'Subtotal conocido'
            : metric.coverage === 'undefined'
              ? 'Ningún importe definido'
              : 'Total registrado'}
      </p>
    </>
  );
}
function Coverage({ metric, unit }: { metric: StatisticMetric; unit: string }) {
  return (
    <>
      <p>
        {metric.defined} de {metric.universe} {unit} con importe definido.
      </p>
      {metric.missing > 0 && <p>{metric.missing} sin cuenta.</p>}
      {metric.undefined > 0 && (
        <p>
          {metric.undefined}{' '}
          {metric.undefined === 1
            ? 'cuenta con importe sin definir'
            : 'cuentas con importe sin definir'}
          .
        </p>
      )}
      {(metric.coverage === 'partial' || metric.coverage === 'undefined') && (
        <p>No se estima el importe faltante.</p>
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
  info: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={`statistics-card statistics-${tone}`}>
      <div className="statistics-card-header">
        <h2>
          <span aria-hidden="true">{icon}</span>
          {title}
        </h2>
        <StatisticsInfo title={title}>{info}</StatisticsInfo>
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
          {(data.status === 'fallback' || error) && (
            <p className="statistics-warning statistics-notice">
              Último verificado · sin actualización confirmada
            </p>
          )}
        </>
      ) : (
        <p className="statistics-unavailable" role="status">
          {loading
            ? 'Consultando IPC oficial…'
            : 'No se pudo consultar el IPC. Reintentaremos automáticamente.'}
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
      {data.empty && (
        <Empty>
          Este período no tiene miembros, compromisos de honorarios ni gastos registrados.
        </Empty>
      )}
      <div className="statistics-grid">
        <Card
          title="Importe a cobrar"
          icon={<CircleDollarSign size={18} />}
          tone="income"
          info={
            <>
              <p>Importes definidos en las cuentas mensuales. Cero es un importe definido.</p>
              <Coverage metric={m.due} unit="miembros" />
            </>
          }
        >
          <Amount metric={m.due} />
        </Card>
        <Card
          title="Cobrado del período"
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
          title="Deuda pendiente"
          icon={<Clock3 size={18} />}
          tone="debt"
          info={
            <>
              <p>
                Saldos deudores individuales conocidos. Los créditos no compensan deudas de otras
                personas.
              </p>
              <Coverage metric={m.debt} unit="miembros" />
            </>
          }
        >
          <Amount metric={m.debt} />
          <dl className="statistics-breakdown">
            <div>
              <dt>Créditos conocidos</dt>
              <dd>
                {m.credit.coverage === 'undefined'
                  ? 'Sin definir'
                  : statisticsMoney(m.credit.value)}
              </dd>
            </div>
          </dl>
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
              <Coverage metric={m.fees_committed} unit="compromisos" />
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
          <dl className="statistics-breakdown">
            <div>
              <dt>Pagado</dt>
              <dd>{statisticsMoney(m.fees_paid.value)}</dd>
            </div>
            <div>
              <dt>Pendiente conocido</dt>
              <dd>
                {m.fees_pending.coverage === 'undefined'
                  ? 'Sin definir'
                  : statisticsMoney(m.fees_pending.value)}
              </dd>
            </div>
          </dl>
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
export function Statistics() {
  const { period, periods } = usePeriod();
  const [openBlock, setOpenBlock] = useState<'expenses' | null>(null);
  const panelId = useId();
  const selected = periods.find((p) => p.id === period);
  const summary = useQuery({
    queryKey: statisticsKey(period),
    enabled: Boolean(period),
    queryFn: async () => {
      const result = statisticsSummarySchema.parse(
        await api(`/statistics/summary?period_id=${period}`),
      );
      if (result.period.id !== period)
        throw new Error('La respuesta no corresponde al período seleccionado.');
      return result;
    },
  });
  const inflation = useQuery({
    queryKey: inflationKey,
    enabled: Boolean(period),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    queryFn: async () => inflationResponseSchema.parse(await api('/statistics/inflation')),
  });
  const data = summary.data?.period.id === period ? summary.data : undefined;
  return (
    <section
      className="statistics-page"
      aria-label={`Estadísticas de ${periodName(data?.period ?? selected)}`}
    >
      <PageHeading title="Estadísticas" description={null} className="statistics-module-heading">
        {period > 0 && (
          <span className="statistics-status">
            {(data?.period.status ?? selected?.status) === 'closed'
              ? 'Período cerrado · consulta histórica'
              : 'Período abierto · datos sujetos a cambios'}
          </span>
        )}
      </PageHeading>
      {!period ? (
        <Empty>Creá un período para consultar sus estadísticas.</Empty>
      ) : summary.isError ? (
        <div role="alert">
          <ErrorBox error={summary.error} />
          <button type="button" onClick={() => summary.refetch()}>
            Reintentar
          </button>
        </div>
      ) : data ? (
        <>
          <ExecutiveSummary
            data={data}
            inflation={inflation.data}
            inflationError={inflation.isError}
            inflationLoading={inflation.isPending}
          />
          <section className="statistics-analysis" aria-label="Análisis del período">
            <h2 className="expense-accordion-heading">
              <button
                type="button"
                aria-expanded={openBlock === 'expenses'}
                aria-controls={panelId}
                onClick={() => setOpenBlock(openBlock === 'expenses' ? null : 'expenses')}
              >
                <span className="expense-accordion-icon">
                  <Receipt size={21} aria-hidden="true" />
                </span>
                <span>
                  <span className="expense-accordion-title">Gastos operativos y honorarios</span>
                </span>
                <span className="expense-accordion-toggle" aria-hidden="true">
                  {openBlock === 'expenses' ? '−' : '+'}
                </span>
              </button>
            </h2>
            <div id={panelId} hidden={openBlock !== 'expenses'}>
              {openBlock === 'expenses' && (
                <Suspense fallback={<Loading />}>
                  <StatisticsExpenseChart
                    key={period}
                    period={period}
                    metric={data.metrics.expenses}
                    summary={data}
                    refreshSummary={() => void summary.refetch()}
                  />
                </Suspense>
              )}
            </div>
          </section>
        </>
      ) : (
        <Loading />
      )}
    </section>
  );
}
