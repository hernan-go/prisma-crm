// In-memory synthetic workflow only. No backend, credentials or external calls.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Knowledge } from '../../client/Knowledge';
import '../../client/styles.css';
const id = '00000000-0000-4000-8000-000000000001';
const before =
  '# Marketing sintético\n\nContexto de prueba sin información empresarial.\n\n## 8.9. Política de comunicación comercial y promociones\n\nLas comunicaciones deben ser claras.\n\nPublicar los requisitos de cada promoción.\n\n## Fuentes\n\nDocumento sintético para QA.';
const doc = {
  id,
  title: 'Marketing, Comercialización y Experiencia del Participante',
  category_id: null,
  category_name: null,
  content_md: before,
  is_active: true,
  revision: 12,
  content_version: 11,
  created_at: '2026-11-01 04:00:00.000',
  updated_at: '2026-11-01 04:00:00.000',
};
const proposals = [1, 2].map((n) => ({
  proposal_id: `00000000-0000-4000-8000-00000000000${n + 1}`,
  request_id: `00000000-0000-4000-8000-00000000000${n + 3}`,
  document_id: id,
  title: doc.title,
  base_revision: 12,
  base_content_version: 11,
  content_sha256: 'a'.repeat(64),
  source: 'chatgpt',
  created_at: '2026-11-01 04:00:00.000',
  decided_at: null,
  decided_by: null,
  result_revision: null,
  result_content_version: null,
  status: 'pending',
  before_md: before,
  content_md: before.replace(
    'Las comunicaciones deben ser claras.',
    n === 1
      ? 'Las comunicaciones deben ser claras y verificables.\n\nIndicar vigencia y condiciones antes de publicar.'
      : 'Las comunicaciones deben expresar los requisitos sin ambigüedades.',
  ),
}));
let writes = 0;
function stats() {
  window.document.getElementById('qa-stats')!.textContent = `Operaciones simuladas: ${writes}`;
}
window.fetch = async (input, init) => {
  const url = String(input),
    method = init?.method ?? 'GET';
  let data: unknown = [],
    status = 200;
  if (!url.startsWith('/api/')) throw Error('Synthetic fixture without network');
  if (method !== 'GET') {
    const p = proposals.find((p) => url.includes(p.proposal_id));
    if (p && /\/(approve|reject)$/.test(url)) {
      writes++;
      stats();
      if (url.endsWith('/approve') && p.status === 'outdated') {
        status = 409;
        data = { message: 'Propuesta desactualizada.' };
      } else {
        p.status = url.endsWith('/approve') ? 'approved' : 'rejected';
        if (p.status === 'approved') {
          doc.content_md = p.content_md;
          doc.content_version++;
          doc.revision++;
          for (const other of proposals)
            if (other !== p && other.status === 'pending') other.status = 'outdated';
        }
        p.content_md = '';
        data = p;
      }
    } else {
      status = 409;
      data = { message: 'Solo resoluciones sintéticas habilitadas.' };
    }
  } else if (url.endsWith('/proposals/counts'))
    data = [
      {
        document_id: id,
        pending_count: proposals.filter((p) => ['pending', 'outdated'].includes(p.status)).length,
      },
    ];
  else if (url.includes('/proposals?'))
    data = proposals.filter((p) => ['pending', 'outdated'].includes(p.status));
  else if (url.includes('/proposals/')) data = proposals.find((p) => url.endsWith(p.proposal_id));
  else if (url.includes('/documents?')) data = { rows: [doc], page: 1, total: 1 };
  else if (url.includes('/documents/')) data = doc;
  else if (url.endsWith('/state')) data = { initialized: true };
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <main style={{ padding: 24 }}>
      <p>QA sintética · datos únicamente en memoria</p>
      <p id="qa-stats">Operaciones simuladas: 0</p>
      <Knowledge />
    </main>
  </QueryClientProvider>,
);
