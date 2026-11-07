import type { EventEconomy } from '../shared/event-economy';
import { formatMoney } from '../shared/domain';
import { Empty } from './components';

export function StatisticsEvents({ data }: { data: EventEconomy }) {
  const events = data.events.filter((event) => event.status !== 'cancelled' && event.commercial);
  return (
    <div className="statistics-events">
      <p className="statistics-panel-note">
        Cobros imputados al período económico. Los indicadores de talleres conservan su universo. Se
        excluyen inscripciones eliminadas y eventos cancelados.
      </p>
      <dl className="statistics-event-totals">
        {(
          [
            ['Talleres y actividades', data.income.workshops],
            ['Eventos cobrados', data.income.events],
            ['Total consolidado', data.income.total],
            ['Gastos directos de eventos', data.event_expenses],
            ['Resultado comercial directo', data.commercial_result],
          ] as const
        ).map(([label, amount]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatMoney(amount)}</dd>
          </div>
        ))}
      </dl>
      {events.length ? (
        <div className="statistics-event-list">
          {events.map((event) => (
            <article key={event.id} className="statistics-event-row">
              <h3>
                #{event.event_number} · {event.name}
                <small>{event.date.slice(0, 10).split('-').reverse().join('/')}</small>
              </h3>
              <dl>
                <div>
                  <dt>Ingreso vigente</dt>
                  <dd>{formatMoney(event.commercial!.gross)}</dd>
                </div>
                <div>
                  <dt>Gastos directos</dt>
                  <dd>{formatMoney(event.direct_expenses)}</dd>
                </div>
                <div>
                  <dt>Resultado directo</dt>
                  <dd>{formatMoney(event.commercial!.result)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <Empty>Sin eventos vigentes en este período.</Empty>
      )}
      <p className="statistics-panel-note">
        Resultado estimado sobre gastos registrados; no representa beneficio neto ni dinero
        disponible. Tras una reprogramación, los gastos vinculados pueden estar registrados en otro
        mes de Gastos Período.
      </p>
    </div>
  );
}
