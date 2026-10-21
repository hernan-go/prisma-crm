// Run Vite and open /tests/browser/people-responsive.html. Resize to exercise real CSS/layout.
// All API calls stay in memory; unexpected requests and writes are blocked.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../client/App';
import '../../client/styles.css';

const people = Array.from({ length: 42 }, (_, i) => ({
  id: i + 1,
  public_id: `P-${String(i + 1).padStart(4, '0')}`,
  nombre: i === 40 ? 'Única' : i % 2 ? 'María Alejandra de los Ángeles' : 'Ana',
  apellido: i % 2 ? 'Fernández de la Comunidad' : 'Prueba',
  telefono: '3410000000',
  email: 'qa@example.invalid',
  activo: i !== 2,
  emergency_phone: i % 2 ? '' : '3410000001',
}));
window.fetch = async (input, init) => {
  if (init?.method && init.method !== 'GET') throw Error('QA: writes blocked');
  const url = new URL(String(input), location.href);
  const path = url.pathname.replace(/^\/api/, '');
  if (path === '/periods') return Response.json([{ id: 1, year: 2026, month: 10, status: 'open' }]);
  if (path === '/people') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const page = Number(url.searchParams.get('page') || 1);
    const rows = people.filter(
      (p) =>
        (p.activo || url.searchParams.get('archived') === 'true') &&
        `${p.nombre} ${p.apellido}`.toLowerCase().includes(q),
    );
    return Response.json({ rows: rows.slice((page - 1) * 40, page * 40), total: rows.length });
  }
  if (/^\/people\/\d+$/.test(path))
    return Response.json({
      ...people[Number(path.split('/')[2]) - 1],
      history: [],
      accounts: [],
      payments: [],
    });
  if (
    [
      '/activities',
      '/instructors',
      '/offerings',
      '/enrollments',
      '/accounts',
      '/payments',
      '/periods/1/memberships',
    ].includes(path)
  )
    return Response.json([]);
  throw Error(`QA: unexpected request ${path}`);
};

const result = document.querySelector('output')!;
function checkLayout() {
  const table = document.querySelector<HTMLTableElement>('.people-table');
  if (!table) {
    result.textContent = 'Esperando tabla…';
    return;
  }
  const mobile = matchMedia('(max-width: 700px)').matches;
  const visible = (e: Element) => getComputedStyle(e).display !== 'none';
  const failures: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) failures.push(message);
  };
  const headers = [...table.querySelectorAll('th')].filter(visible).map((e) => e.textContent);
  const expected = mobile
    ? ['Persona', 'Teléfono', 'Estado']
    : ['Persona', 'ID', 'Teléfono', 'Email', 'Contacto de emergencia', 'Estado'];
  check(JSON.stringify(headers) === JSON.stringify(expected), 'columnas visibles');
  check(document.documentElement.scrollWidth <= innerWidth, 'overflow del documento');
  if (mobile) {
    const panel = document.querySelector<HTMLElement>('.people-table-panel')!;
    check(panel.scrollWidth <= panel.clientWidth + 1, 'scroll horizontal del panel');
    check(table.scrollWidth <= table.clientWidth + 1, 'overflow de tabla');
  }
  for (const row of table.querySelectorAll('tbody tr')) {
    check([...row.children].filter(visible).length === expected.length, 'celdas visibles');
    const name = row.querySelector<HTMLElement>('.person-link > span')!;
    check(getComputedStyle(name).overflow === 'visible' || !mobile, 'nombre truncado');
    const state = row.querySelector<HTMLElement>('.people-status')!;
    check(
      ['Activa', 'Archivada'].includes(state.getAttribute('aria-label') || ''),
      'estado accesible',
    );
    if (mobile) {
      check(!visible(state.firstElementChild!), 'etiqueta textual de estado visible');
      const rect = state.getBoundingClientRect();
      check(rect.width === 12 && rect.height === 12, 'indicador circular de 12px');
    }
  }
  result.textContent = failures.length
    ? `FAIL ${innerWidth}px: ${[...new Set(failures)].join(', ')}`
    : `PASS ${innerWidth}px: ${expected.length} columnas; layout sin regresión`;
}
const scheduleCheck = () => requestAnimationFrame(checkLayout);
new MutationObserver(scheduleCheck).observe(document.getElementById('root')!, {
  childList: true,
  subtree: true,
});
window.addEventListener('resize', scheduleCheck);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={['/personas']}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
