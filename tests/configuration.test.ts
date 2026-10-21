import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { Configuration } from '../client/Configuration';
import { PeriodContext } from '../client/App';

const schedule = (id: number, active: boolean | number, ever_used = 0) => ({
  id,
  active,
  ever_used,
  day: 1,
  start: `${id + 8}:00`,
  end: `${id + 9}:00`,
  instructors: [{ id: 1, name: `Facilitador ${id}` }],
  enrollment_count: 0,
});
function render(schedules: ReturnType<typeof schedule>[], closed = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['/activities'], []);
  client.setQueryData(['/instructors'], []);
  client.setQueryData(
    ['/offerings?period_id=7'],
    [
      {
        id: 10,
        name: 'Informática',
        active: 1,
        catalog_active: 1,
        mode: 'group',
        days: [1],
        schedules,
      },
    ],
  );
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        PeriodContext.Provider,
        {
          value: {
            period: 7,
            periods: [{ id: 7, year: 2026, month: 10, status: closed ? 'closed' : 'open' }],
          },
        },
        createElement(Configuration),
      ),
    ),
  );
  client.clear();
  return html.slice(html.indexOf('<article'), html.indexOf('</article>') + 10);
}
describe('Configuración: horarios no vigentes', () => {
  it('mantiene habilitados sin inscriptos y su orden, agrupando solo deshabilitados al final', () => {
    const html = render([schedule(1, true), schedule(2, false), schedule(3, 1), schedule(4, 0)]);
    const [visible, hidden] = html.split('<details');
    expect(visible).toContain('Facilitador 1');
    expect(visible).toContain('Facilitador 3');
    expect(visible.indexOf('Facilitador 1')).toBeLessThan(visible.indexOf('Facilitador 3'));
    expect(visible).not.toContain('Facilitador 2');
    expect(hidden).toContain('Horarios no vigentes (2)');
    expect(hidden).toContain('Facilitador 2');
    expect(hidden).toContain('Facilitador 4');
    expect(hidden.indexOf('Facilitador 2')).toBeLessThan(hidden.indexOf('Facilitador 4'));
    expect(hidden).not.toMatch(/\bopen(?:=|[ >])/);
  });
  it('omite desplegables vacíos y conserva actividades sin horarios', () => {
    expect(render([schedule(1, true)])).not.toContain('<details');
    const empty = render([]);
    expect(empty).toContain('Informática');
    expect(empty).not.toContain('<details');
  });
  it('conserva la actividad y la edición cuando todos sus horarios están deshabilitados', () => {
    const html = render([schedule(1, false), schedule(2, false)]);
    expect(html).toContain('Informática');
    expect(html).toContain('Horarios no vigentes (2)');
    expect(html.split('<details')[0]).not.toContain('class="payment-row"');
    expect(html.match(/>Editar horario<\/button>/g)).toHaveLength(2);
  });
  it('preserva eliminación solo para horarios nunca utilizados, dentro del desplegable', () => {
    const hidden = render([schedule(1, false), schedule(2, false, 1)]).split('<details')[1];
    expect(hidden.match(/>Editar horario<\/button>/g)).toHaveLength(2);
    expect(hidden.match(/>Eliminar horario<\/button>/g)).toHaveLength(1);
  });
  it('permite consultar el desplegable en períodos cerrados pero bloquea edición y eliminación', () => {
    const html = render([schedule(1, true), schedule(2, false)], true);
    expect(html).toContain('Horarios no vigentes (1)');
    expect(html.match(/<button disabled="">Editar horario<\/button>/g)).toHaveLength(2);
    expect(html.match(/<button[^>]*disabled=""[^>]*>Eliminar horario<\/button>/g)).toHaveLength(2);
  });
});
