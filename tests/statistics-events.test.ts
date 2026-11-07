import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { formatMoney } from '../shared/domain';
import { StatisticsEvents } from '../client/StatisticsEvents';
import { eventEconomySchema } from '../shared/event-economy';
import { eventsFixture } from './browser/statistics-events-fixtures';

const period = { id: 1, year: 2026, month: 11, status: 'open' as const };
it('presenta importes exactos del contrato, omite movimientos y excluye cancelados del detalle', () => {
  const data = eventsFixture(period);
  data.events.push({
    ...data.events[0],
    id: 2,
    event_number: 4,
    name: 'Evento cancelado de prueba',
    status: 'cancelled',
    commercial: null,
  });
  const html = renderToStaticMarkup(
    createElement(StatisticsEvents, { data: eventEconomySchema.parse(data) }),
  );
  expect(html).toContain('#3 · Encuentro sintético');
  expect(html).toContain(formatMoney('115.00'));
  expect(html).toContain(formatMoney('15.00'));
  expect(html).toContain(formatMoney('13.00'));
  expect(html).not.toContain(formatMoney('20.00'));
  expect(html).not.toContain(formatMoney('5.00'));
  expect(html).not.toContain('Evento cancelado de prueba');
  expect(html).not.toMatch(/reintegro|devoluci/i);
  expect(html).toContain('no representa beneficio neto ni dinero');
});
it('cero y ausencia de eventos vigentes conservan un estado vacío explícito', () => {
  const html = renderToStaticMarkup(
    createElement(StatisticsEvents, { data: eventsFixture(period, true) }),
  );
  expect(html).toContain('Sin eventos vigentes');
  expect(html).toContain(formatMoney('0.00'));
  expect(html).not.toContain('Encuentro sintético');
});
