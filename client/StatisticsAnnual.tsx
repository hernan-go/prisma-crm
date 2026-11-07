import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { statisticsMoney, type StatisticsAnnual as AnnualData } from '../shared/statistics';
import { annualChartRows, annualQueryOptions } from './statistics-annual';
import { StatisticsAccordion } from './StatisticsAccordion';
import { StatisticsChartSkeleton } from './StatisticsSkeleton';
import { Empty, ErrorBox } from './components';

type Kind = 'money' | 'people' | 'continuity' | 'entries';
const panels: { kind: Kind; title: string; description: string }[] = [
  {
    kind: 'money',
    title: 'Obligaciones y cobros',
    description:
      'Total a cobrar definido y cobrado imputado al mismo período económico. Los subtotales parciales conservan su cobertura.',
  },
  {
    kind: 'people',
    title: 'Participantes únicos',
    description:
      'Personas distintas inscritas en actividades regulares por mes. No suma actividades ni incluye Eventos Especiales o asistencia.',
  },
  {
    kind: 'continuity',
    title: 'Continuidad entre meses',
    description:
      'Del mes anterior: quienes continúan y quienes no figuran inscritos. No equivale a baja formal; requiere meses calendario consecutivos y una base anterior con personas.',
  },
  {
    kind: 'entries',
    title: 'Incorporaciones y reincorporaciones',
    description:
      'Primera inscripción en el historial disponible o regreso tras un mes sin inscripción. Un cambio de actividad no es una incorporación.',
  },
];
const periodState = (row: AnnualData['months'][number]) =>
  !row.period
    ? 'Período inexistente'
    : `${row.period.status === 'open' ? 'Abierto · provisional' : 'Cerrado'}${!row.has_records ? ' · Sin cuentas ni inscripciones' : ''}`;
const dueText = (row: AnnualData['months'][number]) =>
  !row.due
    ? 'Sin período'
    : row.due.coverage === 'undefined'
      ? 'Sin definir'
      : `${statisticsMoney(row.due.value)}${row.due.coverage === 'partial' ? ' · Subtotal parcial' : row.due.coverage === 'empty' ? ' · Sin cuentas' : ''}`;

function AnnualTooltip({
  active,
  payload,
  kind,
}: {
  active?: boolean;
  payload?: readonly { payload?: ReturnType<typeof annualChartRows>[number] }[];
  kind: Kind;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="expense-chart-tooltip">
      <strong>
        {row.label} · {periodState(row)}
      </strong>
      {kind === 'money' ? (
        <>
          <span>A cobrar: {dueText(row)}</span>
          <span>
            Cobrado: {row.collected ? statisticsMoney(row.collected.value) : 'Sin período'}
          </span>
          {row.due && (
            <span>
              Importes definidos: {row.due.defined}/{row.due.universe} · Sin importe:{' '}
              {row.due.undefined + row.due.missing}
            </span>
          )}
        </>
      ) : kind === 'people' ? (
        <span>{row.participants} personas únicas</span>
      ) : kind === 'continuity' ? (
        <>
          <span>Continúan: {row.continued}</span>
          <span>No figuran: {row.notContinued}</span>
        </>
      ) : (
        <>
          <span>Nuevas en historial: {row.fresh}</span>
          <span>Reincorporadas: {row.rejoined ?? 'Sin comparación suficiente'}</span>
          <span>Sin clasificar: {row.entries?.unclassified}</span>
        </>
      )}
    </div>
  );
}

function AnnualChart({ kind, data }: { kind: Kind; data: AnnualData }) {
  const rows = annualChartRows(data);
  const [showDue, setShowDue] = useState(true);
  const [showCollected, setShowCollected] = useState(true);
  const hasData = rows.some((r) =>
    kind === 'continuity' ? r.continuity : kind === 'entries' ? r.entries : r.period,
  );
  const axis = (
    <>
      <CartesianGrid stroke="var(--statistics-border)" strokeDasharray="3 4" />
      <XAxis
        dataKey="label"
        interval={0}
        tick={{ fill: 'var(--statistics-muted)', fontSize: 10 }}
        tickLine={false}
      />
      <YAxis
        width={kind === 'money' ? 65 : 32}
        allowDecimals={kind === 'money'}
        tick={{ fill: 'var(--statistics-muted)', fontSize: 10 }}
        tickLine={false}
        tickFormatter={
          kind === 'money'
            ? (n: number) =>
                '$ ' +
                new Intl.NumberFormat('es-AR', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(n)
            : undefined
        }
      />
      <Tooltip content={<AnnualTooltip kind={kind} />} isAnimationActive={false} />
      <Legend />
    </>
  );
  return (
    <>
      {kind === 'money' && (
        <div className="statistics-series-controls">
          <label>
            <input
              type="checkbox"
              checked={showDue}
              onChange={(e) => setShowDue(e.target.checked)}
            />{' '}
            A cobrar
          </label>
          <label>
            <input
              type="checkbox"
              checked={showCollected}
              onChange={(e) => setShowCollected(e.target.checked)}
            />{' '}
            Cobrado
          </label>
        </div>
      )}
      {!hasData ? (
        <Empty>
          {kind === 'continuity'
            ? 'Sin meses consecutivos con una base anterior de participantes para comparar.'
            : 'Sin períodos con información para este año.'}
        </Empty>
      ) : (
        <div className="statistics-annual-canvas">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {kind === 'money' || kind === 'people' ? (
              <LineChart
                data={rows}
                accessibilityLayer
                margin={{ top: 12, right: 14, bottom: 0, left: 0 }}
              >
                {axis}
                {kind === 'money' ? (
                  <>
                    <Line
                      dataKey="duePlot"
                      name="A cobrar definido"
                      hide={!showDue}
                      stroke="var(--statistics-cyan)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--statistics-cyan)', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: 'var(--statistics-cyan)' }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="collectedPlot"
                      name="Cobrado"
                      hide={!showCollected}
                      stroke="var(--statistics-green)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: 'var(--statistics-green)', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: 'var(--statistics-green)' }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </>
                ) : (
                  <Line
                    dataKey="participants"
                    name="Personas únicas"
                    stroke="var(--statistics-cyan)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--statistics-cyan)', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: 'var(--statistics-cyan)' }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            ) : (
              <BarChart
                data={rows}
                accessibilityLayer
                margin={{ top: 12, right: 14, bottom: 0, left: 0 }}
              >
                {axis}
                <Bar
                  dataKey={kind === 'continuity' ? 'continued' : 'fresh'}
                  name={kind === 'continuity' ? 'Continúan' : 'Nuevas en historial'}
                  fill="var(--statistics-cyan)"
                  isAnimationActive={false}
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey={kind === 'continuity' ? 'notContinued' : 'rejoined'}
                  name={kind === 'continuity' ? 'No figuran' : 'Reincorporadas'}
                  fill="var(--statistics-amber)"
                  isAnimationActive={false}
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      <details className="statistics-annual-table">
        <summary>Ver datos y cobertura · {panels.find((p) => p.kind === kind)!.title}</summary>
        <div
          className="statistics-table-scroll"
          role="region"
          aria-label={`Datos tabulares · ${panels.find((panel) => panel.kind === kind)!.title}`}
          tabIndex={0}
        >
          <table>
            <caption>{data.year} · Lectura actual por período económico</caption>
            <thead>
              <tr>
                <th scope="col">Mes / estado</th>
                {kind === 'money' ? (
                  <>
                    <th scope="col">A cobrar</th>
                    <th scope="col">Cobrado</th>
                    <th scope="col">Cobertura</th>
                  </>
                ) : kind === 'people' ? (
                  <th scope="col">Personas únicas</th>
                ) : kind === 'continuity' ? (
                  <>
                    <th scope="col">Continúan</th>
                    <th scope="col">No figuran</th>
                  </>
                ) : (
                  <>
                    <th scope="col">Nuevas en historial</th>
                    <th scope="col">Reincorporadas</th>
                    <th scope="col">Sin clasificar</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <th scope="row">
                    {row.label}
                    <small>{periodState(row)}</small>
                  </th>
                  {kind === 'money' ? (
                    <>
                      <td>{dueText(row)}</td>
                      <td>{row.collected ? statisticsMoney(row.collected.value) : '—'}</td>
                      <td>
                        {row.due
                          ? `${row.due.defined}/${row.due.universe} definidos · ${row.due.missing} sin cuenta · ${row.due.undefined} indefinidos`
                          : 'Sin período'}
                      </td>
                    </>
                  ) : kind === 'people' ? (
                    <td>{row.participants ?? 'Sin período'}</td>
                  ) : kind === 'continuity' ? (
                    <>
                      <td>
                        {row.continued ??
                          (row.continuity_reason === 'empty_previous'
                            ? 'Sin base anterior'
                            : 'Sin comparación')}
                      </td>
                      <td>{row.notContinued ?? '—'}</td>
                    </>
                  ) : (
                    <>
                      <td>{row.fresh ?? '—'}</td>
                      <td>{row.rejoined ?? 'Sin comparación'}</td>
                      <td>{row.entries?.unclassified ?? '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export default function StatisticsAnnual({ year }: { year: number }) {
  const query = useQuery(annualQueryOptions(year));
  const data = query.data?.year === year ? query.data : undefined;
  const [open, setOpen] = useState<Kind[]>(['money']);
  return (
    <section aria-label={`Evolución anual ${year}`}>
      {query.isError && (
        <div role="alert">
          <ErrorBox error={query.error} />
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar año
          </button>
        </div>
      )}
      {query.isFetching && data && <p role="status">Actualizando lectura anual…</p>}
      {!data ? (
        query.isPending && (
          <StatisticsChartSkeleton kind="collections" label="Cargando evolución anual…" />
        )
      ) : (
        <>
          <p className="statistics-panel-note">
            Lectura del {new Date(data.as_of).toLocaleString('es-AR')}. Inicio del historial
            disponible: {data.history_start ?? 'sin períodos registrados'}. Los meses inexistentes
            son huecos, no ceros.
          </p>
          {data.months.some(
            (month) => month.due && ['partial', 'undefined'].includes(month.due.coverage),
          ) && (
            <p className="statistics-panel-note" role="note">
              Hay períodos con importes parciales o sin definir. Consultá la cobertura por mes en
              los tooltips o en «Ver datos y cobertura». Los importes totalmente indefinidos no se
              representan como cero.
            </p>
          )}
          <div className="statistics-monthly-grid">
            {panels.map((panel) => (
              <StatisticsAccordion
                key={panel.kind}
                title={panel.title}
                icon={null}
                open={open.includes(panel.kind)}
                onToggle={() =>
                  setOpen((current) =>
                    current.includes(panel.kind)
                      ? current.filter((k) => k !== panel.kind)
                      : [...current, panel.kind],
                  )
                }
              >
                <p className="statistics-panel-note">{panel.description}</p>
                <AnnualChart kind={panel.kind} data={data} />
              </StatisticsAccordion>
            ))}
          </div>
          <div className="statistics-annual-notes">
            {data.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
