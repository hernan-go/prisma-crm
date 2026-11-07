import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import App, { PeriodContext } from '../client/App';
import { SpecialEventPage, EventIndicators, argentinaDate } from '../client/SpecialEvents';
import type { SpecialEventDetail } from '../shared/special-events';

export const sampleEvent: SpecialEventDetail = {
  event_number: 1,
  location: '',
  due: '100.00',
  id: 1,
  period_id: 1,
  name: 'Charla de prueba',
  description: 'Encuentro',
  date: '2026-11-12',
  start_time: '18:00',
  end_time: '20:00',
  price: '100.00',
  capacity: 10,
  status: 'confirmed',
  notes: '',
  revision: 1,
  active_count: 1,
  gross: '30.00',
  pending: '70.00',
  effective_net: '30.00',
  available: 9,
  participants: [
    {
      id: 1,
      event_id: 1,
      person_id: 1,
      nombre: 'Ana',
      apellido: 'Ficticia',
      price: '100.00',
      notes: '',
      active: 1,
      collected: '30.00',
      refunded: '0.00',
      paid: '30.00',
      pending: '70.00',
      excess: '0.00',
    },
  ],
  movements: [],
  history: [],
};
function renderDetail(status = 'open', event = sampleEvent) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['special-events', 'detail', 1], event);
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        PeriodContext.Provider,
        { value: { period: 1, periods: [{ id: 1, year: 2026, month: 11, status }] } },
        createElement(
          MemoryRouter,
          { initialEntries: ['/eventos/1'] },
          createElement(
            Routes,
            {},
            createElement(Route, {
              path: '/eventos/:id',
              element: createElement(SpecialEventPage),
            }),
          ),
        ),
      ),
    ),
  );
  client.clear();
  return html;
}
describe('UI Eventos: datos reales y restricciones', () => {
  it('ordena participantes activos por apellido y nombre sin modificar la respuesta ni movimientos', () => {
    const names = [
      { apellido: 'Zulu', nombre: 'Ana' },
      { apellido: 'Álvarez', nombre: 'Zoe' },
      { apellido: 'alvarez', nombre: 'Ana' },
      { apellido: 'De la Cruz', nombre: 'Luz' },
    ];
    const event = {
      ...sampleEvent,
      active_count: names.length,
      participants: names.map((name, index) => ({
        ...sampleEvent.participants[0],
        ...name,
        id: index + 1,
        person_id: index + 1,
      })),
    };
    const before = structuredClone(event);
    const html = renderDetail('open', event);
    const table = html.split('<tbody>')[1].split('</tbody>')[0];
    const expected = ['alvarez, Ana', 'Álvarez, Zoe', 'De la Cruz, Luz', 'Zulu, Ana'];
    expected.forEach((name, index) => {
      expect(table).toContain(name);
      if (index) expect(table.indexOf(expected[index - 1])).toBeLessThan(table.indexOf(name));
    });
    expect(event).toEqual(before);
  });
  it('muestra tres indicadores de recaudación sin mezclar gastos', () => {
    const html = renderToStaticMarkup(createElement(EventIndicators, { event: sampleEvent }));
    expect(html.match(/class="event-indicator"/g) || []).toHaveLength(3);
    expect(html).not.toContain('Gastos directos</h3>');
    expect(html).toContain('Total a cobrar');
    expect(html).not.toContain('Resultado directo</h3>');
  });
  it('presenta ficha, participantes, movimientos y acciones; cerrado bloquea escrituras', () => {
    const open = renderDetail(),
      closed = renderDetail('closed');
    expect(open).toContain('Ana');
    expect(open.indexOf('aria-label="Indicadores del evento"')).toBeLessThan(
      open.indexOf('panel event-summary'),
    );
    expect(open).toContain('Cobros');
    expect(open).not.toContain('Registrar reintegro');
    expect(closed).toContain('Período cerrado');
    for (const label of ['Editar evento', 'Reprogramar', 'Editar precio', 'Eliminar inscripción']) {
      expect(closed).toMatch(new RegExp(`<button[^>]*disabled[^>]*>${label}</button>`));
    }
  });
  it('cancelado conserva antecedentes sin tarjetas comerciales', () => {
    const html = renderDetail('open', {
      ...sampleEvent,
      status: 'cancelled',
      active_count: 0,
      participants: sampleEvent.participants.map((p) => ({ ...p, active: 0, pending: '0.00' })),
    });
    expect(html).toContain('El evento fue eliminado');
    expect(html).not.toContain('class="event-indicator"');
  });
  it('ofrece Eventos como sección principal en ambas navegaciones', () => {
    const client = new QueryClient();
    client.setQueryData(['periods'], []);
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(MemoryRouter, { initialEntries: ['/eventos'] }, createElement(App)),
      ),
    );
    expect(html).toContain('href="/eventos"');
    expect(html).toContain('Eventos Especiales');
    client.clear();
  });
  it('fecha efectiva inicial usa Argentina incluso cerca de medianoche UTC', () => {
    expect(argentinaDate(new Date('2026-11-02T01:00:00Z'))).toBe('2026-11-01');
  });
  it('gastos y resultado no aparecen en los tres indicadores', () => {
    const html = renderToStaticMarkup(
      createElement(EventIndicators, {
        event: { ...sampleEvent, direct_expenses: '50.25', commercial_net: '-20.25' },
      }),
    );
    expect(html).not.toContain('Pendiente de integración');
    expect(html.match(/class="event-indicator"/g)).toHaveLength(3);
    expect(html).not.toContain('50,25');
    expect(html).not.toContain('20,25');
  });
});
