// Local Vite-only visual fixture. No backend, credentials or business data.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App from '../../client/App';
import '../../client/styles.css';
const doc = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Documento sintético de revisión visual',
  content_md:
    '# Ejemplo sintético\n\nPendiente de completar.\n\n## Procedimientos\n\n- Primera pregunta orientativa.\n- Segunda pregunta orientativa.\n\n**Texto destacado** y [fuente externa](https://example.com).\n\n![Imagen bloqueada](https://example.com/tracker.png)\n\n<script>alert(1)</script>',
  category_id: null,
  category_name: null,
  is_active: false,
  revision: 1,
  content_version: 1,
  created_at: '2026-10-28 10:00:00.000',
  updated_at: '2026-10-28 10:00:00.000',
  pillar_key: null,
};
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith('/api/')) throw Error('Fixture without network');
  if (url === '/api/knowledge/import' && init?.body instanceof FormData) {
    const file = init.body.get('file') as File;
    return new Response(JSON.stringify({ content_md: await file.text() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.endsWith('/export'))
    return new Response(doc.content_md, { headers: { 'Content-Type': 'text/markdown' } });
  if (init?.method && init.method !== 'GET')
    return new Response(JSON.stringify({ message: 'Fixture visual: escrituras deshabilitadas.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  let data: unknown = [];
  if (url === '/api/knowledge/state') data = { initialized: false };
  else if (url.startsWith('/api/knowledge/documents?'))
    data = {
      rows: [
        doc,
        {
          ...doc,
          id: '00000000-0000-4000-8000-000000000002',
          title: 'Documento activo sintético',
          is_active: true,
        },
      ],
      page: 1,
      total: 2,
    };
  else if (url.startsWith('/api/knowledge/documents/')) data = doc;
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/know-how']}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
