import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { People } from '../client/People';

function render() {
  const client = new QueryClient();
  client.setQueryData(['people', '', 1, false], {
    rows: [
      {
        id: 1,
        public_id: 'P-0001',
        nombre: 'Ana',
        apellido: 'Prueba',
        telefono: '3410000000',
        activo: 1,
      },
      {
        id: 2,
        public_id: 'P-0002',
        nombre: 'María Alejandra de los Ángeles',
        apellido: 'Prueba extensa',
        telefono: '3410000001',
        activo: 0,
      },
    ],
    total: 2,
  });
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, {}, createElement(People)),
    ),
  );
  client.clear();
  return html;
}
const cells = (html: string, tag: 'th' | 'td') => [
  ...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'g')),
];
const text = (html: string) => html.replace(/<[^>]*>/g, '');

it('Personas conserva seis columnas y marca solo ID, email y emergencia como exclusivas de desktop', () => {
  const html = render();
  const headers = cells(html, 'th');
  expect(headers.map((h) => text(h[2]))).toEqual([
    'Persona',
    'ID',
    'Teléfono',
    'Email',
    'Contacto de emergencia',
    'Estado',
  ]);
  expect(headers.filter((h) => !h[1].includes('desktop-only')).map((h) => text(h[2]))).toEqual([
    'Persona',
    'Teléfono',
    'Estado',
  ]);
  const rows = html
    .split('<tbody>')[1]
    .split('</tbody>')[0]
    .match(/<tr>[\s\S]*?<\/tr>/g)!;
  for (const row of rows) {
    const columns = cells(row, 'td');
    expect(columns).toHaveLength(6);
    expect(
      columns.map((c, i) => (c[1].includes('desktop-only') ? i : -1)).filter((i) => i >= 0),
    ).toEqual([1, 3, 4]);
    expect(columns[0][2]).not.toContain('P-000');
    expect(columns[0][2]).toContain('participant-name');
  }
});

it('estados activos y archivados conservan descripción accesible aunque se oculte su etiqueta mobile', () => {
  const html = render();
  for (const label of ['Activa', 'Archivada']) {
    expect(html).toContain(`role="img" aria-label="${label}"`);
    expect(html).toContain(`<span class="desktop-only">${label}</span>`);
  }
  expect(html).toContain('María Alejandra de los Ángeles');
  expect(html).toContain('href="/personas/2"');
});
