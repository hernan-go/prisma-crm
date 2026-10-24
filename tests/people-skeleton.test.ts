import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { People, peopleQueryOptions } from '../client/People';

const response = (name = 'Ana', total = 1) => ({
  rows: total
    ? [
        {
          id: 1,
          nombre: name,
          apellido: 'Sintética',
          telefono: '3410000000',
          public_id: 'P-0001',
          activo: 1,
        },
      ]
    : [],
  total,
});
const clients: QueryClient[] = [];
function client() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
  });
  clients.push(qc);
  return qc;
}
function render(qc: QueryClient) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(MemoryRouter, {}, createElement(People)),
    ),
  );
}
afterEach(() => {
  clients.splice(0).forEach((qc) => qc.clear());
  vi.unstubAllGlobals();
});

it('carga conserva tabla de seis columnas, filas decorativas y controles sin anunciar cero ni vacío', () => {
  const html = render(client());
  expect(html.match(/<th\b/g)).toHaveLength(6);
  expect(html.match(/class="people-skeleton-row" aria-hidden="true"/g)).toHaveLength(6);
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('Cargando personas…');
  expect(html).not.toContain('No hay personas');
  expect(html).not.toContain('0 personas');
  expect(html).not.toMatch(/<tbody>\s*<div/);
  const row = html.match(/<tr class="people-skeleton-row"[\s\S]*?<\/tr>/)![0];
  expect(row.match(/<td\b/g)).toHaveLength(6);
  expect(row.match(/desktop-only/g)).toHaveLength(3);
  expect(row).not.toMatch(/<button|<a\s|tabindex/);
});

it('resolución y caché sustituyen las filas Skeleton por personas y contador reales', () => {
  const qc = client();
  qc.setQueryData(peopleQueryOptions('', 1, false).queryKey, response());
  const html = render(qc);
  expect(html).toContain('Ana');
  expect(html).toContain('1 personas');
  expect(html).toContain('href="/personas/1"');
  expect(html).not.toContain('people-skeleton-row');
  expect(html).not.toContain('aria-busy="true"');
});

it('vacío confirmado y error sin datos tienen mensajes distintos; error ofrece reintento sin contador cero', async () => {
  const qc = client();
  qc.setQueryData(peopleQueryOptions('', 1, false).queryKey, response('', 0));
  expect(render(qc)).toContain('No hay personas para mostrar.');
  expect(render(qc)).toContain('0 personas');
  qc.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ message: 'Consulta fallida' }, { status: 503 })),
  );
  await expect(qc.fetchQuery(peopleQueryOptions('', 1, false))).rejects.toThrow('Consulta fallida');
  const html = render(qc);
  expect(html).toContain('Consulta fallida');
  expect(html).toContain('Reintentar');
  expect(html).not.toContain('No hay personas');
  expect(html).not.toContain('0 personas');
  expect(html).not.toContain('people-skeleton-row');
});

it('actualización y su error mantienen personas válidas del mismo contexto', () => {
  const qc = client();
  qc.setQueryData(peopleQueryOptions('', 1, false).queryKey, response());
  const query = qc.getQueryCache().find({ queryKey: ['people', '', 1, false] })!;
  query.setState({ fetchStatus: 'fetching' });
  expect(render(qc)).toContain('Ana');
  expect(render(qc)).toContain('Actualizando');
  expect(render(qc)).not.toContain('people-skeleton-row');
  query.setState({
    fetchStatus: 'idle',
    status: 'error',
    error: new Error('Actualización fallida'),
  });
  expect(render(qc)).toContain('Ana');
  expect(render(qc)).toContain('Actualización fallida');
  expect(render(qc)).toContain('Reintentar');
});

it('búsqueda, página y archivadas tienen cachés separadas y una respuesta tardía no cambia el contexto activo', async () => {
  const qc = client();
  let release!: (value: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('q=Ana') ? delayed : Promise.resolve(Response.json(response('Página dos'))),
    ),
  );
  const first = peopleQueryOptions('Ana', 1, false);
  const next = peopleQueryOptions('Ana', 2, true);
  expect(
    new Set(
      [
        first.queryKey,
        peopleQueryOptions('Otra', 1, false).queryKey,
        peopleQueryOptions('Ana', 2, false).queryKey,
        peopleQueryOptions('Ana', 1, true).queryKey,
      ].map((key) => JSON.stringify(key)),
    ).size,
  ).toBe(4);
  expect(first.queryKey).not.toEqual(next.queryKey);
  const observer = new QueryObserver(qc, first);
  const stop = observer.subscribe(() => {});
  // A second context must have its own request even when search text is identical.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(response('Página dos'))),
  );
  observer.setOptions(next);
  expect(observer.getCurrentResult().data).toBeUndefined();
  await qc.fetchQuery(next);
  release(Response.json(response('Primera tardía')));
  await qc.fetchQuery(first);
  expect(observer.getCurrentResult().data?.rows[0].nombre).toBe('Página dos');
  expect(qc.getQueryData(first.queryKey)).toEqual(response('Primera tardía'));
  observer.setOptions(first);
  expect(observer.getCurrentResult().data?.rows[0].nombre).toBe('Primera tardía');
  stop();
});
