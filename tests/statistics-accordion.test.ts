import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { StatisticsAccordion } from '../client/StatisticsAccordion';
const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useSyncExternalStore: () => viewport.mobile,
}));
afterEach(() => {
  viewport.mobile = false;
});
function render(open: boolean) {
  return renderToStaticMarkup(
    createElement(StatisticsAccordion, {
      title: 'Ingresos y cobranzas',
      icon: null,
      open,
      onToggle: () => {},
      children: createElement('button', null, 'Acción del gráfico'),
    }),
  );
}
it.each([false, true])(
  'escritorio/tablet muestra el panel con estado móvil abierto=%s sin control desplegable',
  (open) => {
    const html = render(open);
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain(' hidden=');
    expect(html).toContain('Acción del gráfico');
    const heading = html.match(/<h2 id="([^"]+)"/)![1];
    expect(html).toContain('aria-labelledby="' + heading + '"');
  },
);
it.each([false, true])(
  'móvil abierto=%s relaciona control y región y oculta acciones cerradas',
  (open) => {
    viewport.mobile = true;
    const html = render(open);
    const target = html.match(/aria-controls="([^"]+)"/)![1];
    expect(html).toContain('id="' + target + '"');
    expect(html).toContain('aria-expanded="' + open + '"');
    expect(html.includes('hidden=""')).toBe(!open);
  },
);
