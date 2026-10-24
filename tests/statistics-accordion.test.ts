import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { StatisticsAccordion } from '../client/StatisticsAccordion';

it.each([false, true])(
  'panel abierto=%s relaciona control y región, y protege contenido cerrado',
  (open) => {
    const html = renderToStaticMarkup(
      createElement(StatisticsAccordion, {
        title: 'Ingresos y cobranzas',
        icon: null,
        open,
        onToggle: () => {},
        children: createElement('button', null, 'Acción del gráfico'),
      }),
    );
    const target = html.match(/aria-controls="([^"]+)"/)![1];
    expect(html).toContain(`id="${target}"`);
    expect(html).toContain(`aria-labelledby="${target}-button"`);
    expect(html).toContain(`aria-expanded="${open}"`);
    expect(html).toContain(`aria-hidden="${!open}"`);
    expect(html.includes('Acción del gráfico')).toBe(open);
    expect(html.includes('inert=""')).toBe(!open);
  },
);
