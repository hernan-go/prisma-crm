import { useId } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { statisticsMoney, type StatisticsSummary } from '../shared/statistics';
import { Empty } from './components';
import { StatisticsInfo } from './Statistics';
import { collectionsReconcile } from './statistics-collections';
import { periodName } from './App';

export default function StatisticsCollectionsChart({ summary }: { summary: StatisticsSummary }) {
  const id = useId().replace(/:/g, '');
  const c = summary.collections;
  const m = summary.metrics;
  const period = periodName(summary.period);
  const title = `Cobros — ${period.charAt(0).toUpperCase()}${period.slice(1)}`;
  if (!c)
    return (
      <article className="expense-analysis-tile">
        <p role="status">
          El resumen no incluye el detalle de cobranzas. Actualizá la aplicación y el resumen.
        </p>
      </article>
    );
  const reconciles = collectionsReconcile(summary);
  const positive = BigInt(m.due.value.replace('.', '')) > 0n;
  const showCredit = BigInt(m.credit.value.replace('.', '')) > 0n;
  const showUndefined = BigInt(c.collected_undefined.replace('.', '')) > 0n;
  const withoutAmount = m.due.undefined + m.due.missing;
  const values = [
    {
      name: 'Importes a cobrar registrados',
      applied: Number(c.applied_known),
      pending: Number(m.debt.value),
    },
  ];
  return (
    <article className="expense-analysis-tile collections-tile">
      <div className="expense-chart-heading">
        <div>
          <p className="expense-chart-eyebrow">INGRESOS DEL PERÍODO</p>
          <h3>{title}</h3>
        </div>
        <StatisticsInfo title="Cobros">
          <p>
            En esta barra, Cobrado es la parte de los pagos que cubre los importes a cobrar
            registrados. El dorado muestra lo que falta cobrar. Los saldos a favor no compensan
            deudas de otras personas.
          </p>
          <p>
            El porcentaje se calcula únicamente con los importes a cobrar registrados. Los saldos a
            favor y los cobros sin importe a cobrar definido se informan por separado.
            {` Hay ${m.due.defined} de ${m.due.universe} personas del período con importe a cobrar registrado.`}
          </p>
          <p>
            Período económico de las cuentas, aunque la fecha efectiva de cobro sea de otro mes.
            Importes en pesos argentinos (ARS). El registro actual de un período cerrado no es un
            snapshot inmutable.
          </p>
        </StatisticsInfo>
      </div>
      {!reconciles && (
        <p role="alert">
          Los importes de cobranzas no concilian. Se conservan los valores recibidos; no se
          representa una proporción.
        </p>
      )}
      <div className="collections-percentage" role="status">
        <strong>
          {reconciles && positive && c.covered_percentage !== null
            ? `${c.covered_percentage.replace('.', ',')} %`
            : 'No calculable'}
        </strong>
        <span>del importe total a cobrar</span>
      </div>
      {withoutAmount > 0 && (
        <p className="collections-coverage" role="note">
          Hay {withoutAmount} {withoutAmount === 1 ? 'persona' : 'personas'} sin importe a cobrar
          registrado. El porcentaje se calcula únicamente con los importes disponibles.
        </p>
      )}
      {!m.due.universe ? (
        <Empty>Sin personas en este período.</Empty>
      ) : !positive ? (
        <p>No hay un importe total a cobrar mayor que cero registrado.</p>
      ) : reconciles ? (
        <div className="collections-canvas">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={values}
              layout="vertical"
              accessibilityLayer
              aria-label="Cobrado y falta cobrar de los importes registrados; usar flechas para explorar"
              margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <defs>
                {[
                  ['applied', '#71E1E8'],
                  ['pending', '#ECC682'],
                ].map(([key, color]) => (
                  <linearGradient key={key} id={`${id}-${key}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.46} />
                    <stop offset="45%" stopColor={color} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.06} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis type="number" hide domain={[0, Number(m.due.value)]} />
              <YAxis type="category" dataKey="name" hide />
              <Tooltip
                isAnimationActive={false}
                cursor={false}
                position={{ x: 8, y: 8 }}
                content={({ active }) =>
                  active ? (
                    <div className="expense-chart-tooltip">
                      <strong>Importes a cobrar registrados</strong>
                      <span>Cobrado: {statisticsMoney(c.applied_known)}</span>
                      <span>Falta cobrar: {statisticsMoney(m.debt.value)}</span>
                      <span>Total a cobrar: {statisticsMoney(m.due.value)}</span>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="applied"
                name="Cobrado"
                stackId="known"
                fill={`url(#${id}-applied)`}
                stroke="#71E1E8"
                strokeOpacity={0.62}
                strokeWidth={0.8}
                barSize={32}
                isAnimationActive={false}
              />
              <Bar
                dataKey="pending"
                name="Falta cobrar"
                stackId="known"
                fill={`url(#${id}-pending)`}
                stroke="#ECC682"
                strokeOpacity={0.62}
                strokeWidth={0.8}
                barSize={32}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <dl
        className="collections-values"
        data-extra-count={Number(showCredit) + Number(showUndefined)}
      >
        <div>
          <dt>
            <i className="collections-applied" />
            Cobrado
          </dt>
          <dd>{statisticsMoney(c.applied_known)}</dd>
        </div>
        <div>
          <dt>
            <i className="collections-pending" />
            Falta cobrar
          </dt>
          <dd>{statisticsMoney(m.debt.value)}</dd>
        </div>
        <div>
          <dt>Total a cobrar</dt>
          <dd>{statisticsMoney(m.due.value)}</dd>
        </div>
        {showCredit && (
          <div className="collections-reference">
            <dt>Saldos a favor</dt>
            <dd>{statisticsMoney(m.credit.value)}</dd>
          </div>
        )}
        {showUndefined && (
          <div className="collections-reference">
            <dt>Cobros sin importe a cobrar definido</dt>
            <dd>{statisticsMoney(c.collected_undefined)}</dd>
          </div>
        )}
      </dl>
      <div className="expense-chart-sr-only">
        <table>
          <caption>
            Cobros · ARS · período económico {summary.period.month}/{summary.period.year}
          </caption>
          <thead>
            <tr>
              <th scope="col">Magnitud</th>
              <th scope="col">Importe</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Total a cobrar', m.due.value],
              ['Cobrado (aplicado a los importes registrados)', c.applied_known],
              ['Falta cobrar', m.debt.value],
              ['Saldos a favor', m.credit.value],
              ['Cobros sin importe a cobrar definido', c.collected_undefined],
              ['Cobrado registrado', m.collected.value],
            ].map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{statisticsMoney(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
