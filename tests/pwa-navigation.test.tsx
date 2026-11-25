import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import App from '../client/App';

it('renders the independent PWA module with matching header and active main navigation', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['periods'], []);
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/accesos-pwa']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(html).toContain('<h1>Accesos PWA</h1>');
  expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/accesos-pwa"/);
  expect(html).toContain('Buscar una persona existente');
  expect(html).not.toContain('Página no encontrada');
  expect(html).not.toContain('← Configuración');
  client.clear();
});
