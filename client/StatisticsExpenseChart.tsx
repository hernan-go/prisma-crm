import { useQuery } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  statisticsMoney,
  type StatisticMetric,
  type StatisticsExpenseBreakdown,
} from '../shared/statistics';
import { ErrorBox, Empty } from './components';
import { StatisticsChartSkeleton } from './StatisticsSkeleton';
import { expenseChartRows, expenseQueryOptions } from './statistics-expenses';
import { StatisticsInfo } from './Statistics';

const motionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (callback: () => void) => {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
};

type ExpenseRow = ReturnType<typeof expenseChartRows>[number];
export function ExpenseChartInformation() {
  return (
    <>
      <p>
        Todos los conceptos y categorías con movimientos del período, ordenados de mayor a menor.
        Importes en pesos argentinos (ARS), sin incluir honorarios.
      </p>
      <p>
        Los gastos registrados no acreditan pagos realizados. Una categoría ausente no equivale a
        una obligación de $0 ni demuestra que la carga esté completa.
      </p>
      <p>
        Explorá las barras con las flechas del teclado. Los nombres completos e importes exactos
        están en el tooltip y en la alternativa para lectores de pantalla.
      </p>
    </>
  );
}
function ExpenseTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ExpenseRow }[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="expense-chart-tooltip">
      <span
        className={`expense-kind expense-kind-${row.kind === 'Recurrente' ? 'recurring' : 'additional'}`}
      >
        {row.kind}
      </span>
      <strong>{row.name}</strong>
      {row.recurring_concept_name && row.category_name !== row.name && (
        <span>{row.category_name}</span>
      )}
      <b>{statisticsMoney(row.amount)}</b>
      <small>
        {row.movement_count}{' '}
        {row.movement_count === 1 ? 'movimiento registrado' : 'movimientos registrados'}
      </small>
    </div>
  );
}

export function ExpenseVisualization({ data }: { data: StatisticsExpenseBreakdown }) {
  const rows = expenseChartRows(data);
  const [chartWidth, setChartWidth] = useState(0);
  const axisWidth =
    chartWidth >= 1000 ? 260 : chartWidth >= 600 ? 190 : chartWidth >= 450 ? 160 : 112;
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    () => true,
  );
  return (
    <article className="expense-analysis-tile">
      <div className="expense-chart-heading">
        <div>
          <p className="expense-chart-eyebrow">COMPOSICIÓN DEL MES</p>
        </div>
        <div className="expense-chart-tools">
          <ul className="expense-chart-legend" aria-label="Tipos de gasto">
            <li>
              <i className="expense-dot-recurring" />
              Recurrentes
            </li>
            <li>
              <i className="expense-dot-additional" />
              Adicionales
            </li>
          </ul>
          <StatisticsInfo title="Composición de gastos">
            <ExpenseChartInformation />
          </StatisticsInfo>
        </div>
      </div>
      {!rows.length ? (
        <Empty>Sin movimientos de gastos registrados en este período.</Empty>
      ) : (
        <>
          <div
            className="expense-chart-canvas"
            style={{ height: Math.max(190, rows.length * 32 + 40) }}
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              onResize={(width) => setChartWidth(width)}
            >
              <BarChart
                data={rows}
                layout="vertical"
                accessibilityLayer
                aria-label="Gastos registrados por categoría; usar flechas para explorar"
                margin={{ top: 8, right: 28, bottom: 8, left: 0 }}
                barSize={18}
              >
                <CartesianGrid horizontal={false} stroke="#FFFFFF0F" strokeDasharray="3 6" />
                <XAxis
                  type="number"
                  domain={[0, 'auto']}
                  tickCount={4}
                  tickFormatter={(value: number) =>
                    '$ ' +
                    new Intl.NumberFormat('es-AR', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(value)
                  }
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--chart-muted)', fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="category_id"
                  width={axisWidth}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={({ x, y, payload }) => {
                    const row = rows.find((r) => r.category_id === payload.value)!;
                    const limit = Math.floor((axisWidth - 12) / 7);
                    const short =
                      row.name.length > limit ? `${row.name.slice(0, limit - 1)}…` : row.name;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <title>
                          {row.name} · {row.kind} · {statisticsMoney(row.amount)}
                        </title>
                        <text x={-8} y={4} textAnchor="end" fill="var(--chart-text)" fontSize={12}>
                          {short}
                        </text>
                      </g>
                    );
                  }}
                />
                <Tooltip
                  content={<ExpenseTooltip />}
                  cursor={{ fill: '#68C8D3', fillOpacity: 0.05 }}
                  isAnimationActive={!reducedMotion}
                  animationDuration={120}
                />
                <Bar
                  dataKey="plotAmount"
                  name="Gasto registrado"
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={!reducedMotion}
                  animationDuration={450}
                  animationBegin={0}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.category_id}
                      fill={
                        row.kind === 'Recurrente'
                          ? 'var(--statistics-cyan, #68C8D3)'
                          : 'var(--statistics-neutral, #8D9CA5)'
                      }
                      stroke={row.kind === 'Recurrente' ? '#68C8D3' : '#8D9CA5'}
                      strokeOpacity={0.62}
                      strokeWidth={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="expense-chart-sr-only">
            <table>
              <caption className="expense-chart-sr-only">Importes registrados · ARS</caption>
              <colgroup>
                <col className="expense-col-name" />
                <col className="expense-col-kind" />
                <col className="expense-col-amount" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Categoría / concepto</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Importe (ARS)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.category_id}>
                    <th scope="row">
                      {row.name}
                      {row.recurring_concept_name && row.category_name !== row.name && (
                        <small>{row.category_name}</small>
                      )}
                    </th>
                    <td>{row.kind}</td>
                    <td>{statisticsMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2}>
                    Total registrado
                  </th>
                  <td>{statisticsMoney(data.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </article>
  );
}

export default function StatisticsExpenseChart({
  period,
  metric,
  refreshSummary,
}: {
  period: number;
  metric: StatisticMetric;
  refreshSummary: () => void;
}) {
  const query = useQuery(expenseQueryOptions(period));
  const data = query.data?.period.id === period ? query.data : undefined;
  const reconciles = data?.total === metric.value && data?.movement_count === metric.universe;
  return (
    <div className="statistics-expense-panel">
      {query.isPending ? (
        <StatisticsChartSkeleton kind="expenses" />
      ) : query.isError && !data ? (
        <article className="expense-analysis-tile" role="alert">
          <ErrorBox error={query.error} />
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar gastos
          </button>
        </article>
      ) : data ? (
        <div className="expense-analysis-slot">
          {(!reconciles || query.isFetching) && (
            <div role="status" className="expense-analysis-warning">
              {query.isFetching
                ? 'Actualizando gastos…'
                : 'El gráfico y el indicador corresponden a lecturas diferentes. Actualizá ambas consultas para conciliarlas.'}
              {!query.isFetching && (
                <button
                  type="button"
                  onClick={() => {
                    void query.refetch();
                    refreshSummary();
                  }}
                >
                  Actualizar lecturas
                </button>
              )}
            </div>
          )}
          <ExpenseVisualization data={data} />
          {query.isError && (
            <div role="alert">
              <ErrorBox error={query.error} />
              <button type="button" onClick={() => void query.refetch()}>
                Reintentar gastos
              </button>
            </div>
          )}
        </div>
      ) : (
        <article className="expense-analysis-tile">
          <Empty>Sin datos de gastos.</Empty>
        </article>
      )}
    </div>
  );
}
