import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pie, PieChart, ResponsiveContainer } from 'recharts';
import { statisticsMoney, type StatisticsSummary } from '../shared/statistics';
import { ErrorBox, Empty } from './components';
import { StatisticsChartSkeleton } from './StatisticsSkeleton';
import { StatisticsInfo } from './Statistics';
import {
  facilitatorChartRows,
  facilitatorQueryOptions,
  reconcileFacilitatorAccounts,
} from './statistics-fees';
// Approved palette plus lighter violet/cyan tints for additional facilitators.
const colors = ['#71E1E8', '#6452CE', '#ECC682', '#FFFFFF', '#A99BE4', '#B8F0F4'];
export function StatisticsFeesChart({
  summary,
  refreshSummary,
}: {
  summary: StatisticsSummary;
  refreshSummary: () => void;
}) {
  const paintId = useId().replace(/:/g, '');
  const period = summary.period.id;
  const query = useQuery(facilitatorQueryOptions(period));
  const rows = facilitatorChartRows(query.data ?? []);
  const differences = query.data ? reconcileFacilitatorAccounts(query.data, summary) : [];
  const [active, setActive] = useState<number | null>(null);
  const current = rows.find((r) => r.id === active);
  if (query.isPending) return <StatisticsChartSkeleton kind="fees" />;
  const legend = (side: 'left' | 'right', people: typeof rows) => (
    <ul
      className={`fees-ring-legend fees-legend-${side}`}
      aria-label={side === 'left' ? 'Facilitadores a la izquierda' : 'Facilitadores a la derecha'}
    >
      {people.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onFocus={() => setActive(row.id)}
            onBlur={() => setActive(null)}
            onMouseEnter={() => setActive(row.id)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(row.id)}
          >
            <i
              style={{ background: colors[rows.findIndex((r) => r.id === row.id) % colors.length] }}
            />
            <span>
              {row.name}
              <small>
                A pagar: {row.due === null ? 'Sin importe definido' : statisticsMoney(row.due)}
              </small>
            </span>
            <strong>Pagado: {statisticsMoney(row.paid)}</strong>
          </button>
          {row.warning && <small>{row.warning}</small>}
        </li>
      ))}
    </ul>
  );
  return (
    <article className="expense-analysis-tile fees-analysis-tile">
      <div className="expense-chart-heading">
        <div>
          <p className="expense-chart-eyebrow">PAGO DE FACILITADORES</p>
          <h3>Honorarios del mes</h3>
        </div>
        <StatisticsInfo title="Honorarios del mes">
          <p>
            Una porción por facilitador del período seleccionado, independiente de los gastos
            operativos. Cada porción tiene igual tamaño; su relleno indica el porcentaje pagado de
            su propio importe a pagar, no su peso económico.
          </p>
          <p>
            Sin pagos: contorno. Pago parcial: relleno proporcional. Pago completo: relleno
            completo. Importes indefinidos, base cero o sobrepagos: contorno y advertencia, sin
            inventar proporciones.
          </p>
          <p>
            Las cuentas por actividad de cada facilitador se agrupan con importes exactos.
            Seleccioná su nombre para consultar A pagar y Pagado.
          </p>
        </StatisticsInfo>
      </div>
      {!query.isPending && !query.isError && (query.isFetching || differences.length > 0) && (
        <div className="fees-ring-note" role="status">
          {query.isFetching ? (
            'Actualizando honorarios…'
          ) : (
            <>
              No se pudo conciliar el gráfico con el resumen: {differences.join(', ')}. Los importes
              conservan sus fuentes de lectura.
              <button
                type="button"
                onClick={() => {
                  void query.refetch();
                  refreshSummary();
                }}
              >
                Actualizar honorarios
              </button>
            </>
          )}
        </div>
      )}
      {query.isError && !query.data ? (
        <div role="alert">
          <ErrorBox error={query.error} />
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar honorarios
          </button>
        </div>
      ) : !rows.length ? (
        <Empty>Sin facilitadores en este período.</Empty>
      ) : (
        <div className="fees-layout">
          {legend('left', rows.slice(0, Math.ceil(rows.length / 2)))}
          <div className="fees-ring">
            <div className="fees-ring-canvas" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart accessibilityLayer={false}>
                  <defs>
                    {colors.map((color, index) => (
                      <radialGradient
                        key={color}
                        id={`${paintId}-glass-${index}`}
                        gradientUnits="userSpaceOnUse"
                        cx="50%"
                        cy="50%"
                        r="50%"
                      >
                        <stop offset="0%" stopColor={color} stopOpacity={0} />
                        <stop offset="68%" stopColor={color} stopOpacity={0.06} />
                        <stop offset="78%" stopColor={color} stopOpacity={0.2} />
                        <stop offset="90%" stopColor={color} stopOpacity={0.52} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                      </radialGradient>
                    ))}
                  </defs>
                  {rows.flatMap((row, index) => {
                    const start = 90 - (index * 360) / rows.length;
                    const span = 360 / rows.length - Math.min(9, 90 / rows.length);
                    const color = colors[index % colors.length];
                    const common = {
                      data: [{ value: 1 }],
                      dataKey: 'value',
                      cx: '50%',
                      cy: '50%',
                      innerRadius: '72%',
                      outerRadius: '90%',
                      startAngle: start,
                      cornerRadius: 3,
                      rootTabIndex: -1,
                      isAnimationActive: false,
                      onMouseEnter: () => setActive(row.id),
                      onMouseLeave: () => setActive(null),
                    };
                    return [
                      <Pie
                        {...common}
                        key={row.id + 'track'}
                        endAngle={start - span}
                        fill="none"
                        stroke={color}
                        strokeOpacity={active === row.id ? 1 : 0.78}
                        strokeWidth={active === row.id ? 1.7 : 1}
                      />,
                      ...(row.fraction > 0
                        ? [
                            <Pie
                              {...common}
                              key={row.id + 'fill'}
                              endAngle={start - span * row.fraction}
                              className="fees-ring-glass-fill"
                              fill={`url(#${paintId}-glass-${index % colors.length})`}
                              stroke={color}
                              strokeOpacity={0.8}
                              strokeWidth={0.8}
                            />,
                          ]
                        : []),
                    ];
                  })}
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="fees-ring-center" role="status">
              <span>{current?.name ?? 'Facilitadores'}</span>
              <strong>{current ? statisticsMoney(current.paid) : rows.length}</strong>
              <small>{current ? 'Pagado' : 'del período'}</small>
            </div>
          </div>
          {legend('right', rows.slice(Math.ceil(rows.length / 2)))}
        </div>
      )}
      {query.isError && query.data && (
        <div role="alert">
          <ErrorBox error={query.error} />
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar honorarios
          </button>
        </div>
      )}
    </article>
  );
}
