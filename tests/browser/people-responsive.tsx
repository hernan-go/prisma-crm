// Run Vite and open /tests/browser/people-responsive.html. Resize to exercise real CSS/layout.
// All API calls stay in memory; unexpected requests and writes are blocked.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../client/App';
import '../../client/styles.css';
import { useEffect, useState } from 'react';

const manual = new URLSearchParams(location.search).get('loading') === 'manual';
const responseDelay = Number(new URLSearchParams(location.search).get('delay') || 0);
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 20000, refetchOnWindowFocus: false } },
});
const waiting: (() => void)[] = [];
const requests: string[] = [];
let failNext = false;
let inputAt = 0;
let debounceReference = { height: 0, width: 0 };
let debounceCheck = '';
const transitionFailures: string[] = [];
const trace: string[] = [];
let lastSample = '';
const traceOutput = document.createElement('pre');
traceOutput.dataset.testid = 'people-load-trace';
document.body.append(traceOutput);
async function exerciseSearch(interval: number) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Buscar personas"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  trace.length = 0;
  transitionFailures.length = 0;
  debounceCheck = '';
  for (const value of ['Ú', 'Ún', 'Úni', 'Única', 'Únicax']) {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  await new Promise((resolve) => setTimeout(resolve, 250 + responseDelay));
  if (document.querySelector('.pagination small')?.textContent !== '0 personas') {
    transitionFailures.push('la secuencia no terminó en el vacío esperado');
  }
  traceOutput.textContent = `${transitionFailures.length ? 'FAIL' : 'PASS'} secuencia ${interval}ms, red ${responseDelay}ms\n${trace.join('\n')}\n${transitionFailures.join('\n')}`;
}
document.addEventListener(
  'input',
  (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') {
      inputAt = performance.now();
      const panel = document.querySelector('.people-table-panel');
      if (
        panel &&
        panel.querySelector('.pagination small')?.textContent !== 'Esperando búsqueda…'
      ) {
        debounceReference = { height: panel.getBoundingClientRect().height, width: innerWidth };
      }
    }
  },
  true,
);
const notify = () => window.dispatchEvent(new Event('people-fixture-request'));
function Controls() {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update((n) => n + 1);
    window.addEventListener('people-fixture-request', refresh);
    return () => window.removeEventListener('people-fixture-request', refresh);
  }, []);
  return (
    <details
      open
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 10000,
        padding: 12,
        background: '#151a1c',
        maxWidth: '90vw',
        border: '1px solid #385158',
      }}
    >
      <summary>Controles QA Personas</summary>
      {!manual && (
        <>
          <button onClick={() => void exerciseSearch(450)}>Probar escritura lenta (450 ms)</button>
          <button onClick={() => void exerciseSearch(600)}>Probar escritura lenta (600 ms)</button>
          <button onClick={() => void exerciseSearch(50)}>Probar escritura rápida (50 ms)</button>
        </>
      )}
      <button
        onClick={() => {
          waiting.shift()?.();
          notify();
        }}
      >
        Liberar primera respuesta
      </button>
      <button
        onClick={() => {
          waiting.pop()?.();
          notify();
        }}
      >
        Liberar última respuesta
      </button>
      <button
        onClick={() => {
          failNext = true;
          notify();
        }}
      >
        Fallar próxima respuesta{failNext ? ' (activado)' : ''}
      </button>
      <button onClick={() => void client.refetchQueries({ queryKey: ['people'], type: 'active' })}>
        Actualizar Personas
      </button>
      <output data-testid="people-requests">
        {requests.length} solicitudes; {waiting.length} pendientes. {requests.at(-1)}
      </output>
    </details>
  );
}

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
    requests.push(
      `${url.search}; debounce=${inputAt ? Math.round(performance.now() - inputAt) : 'inicial'}ms`,
    );
    if (manual)
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
        notify();
      });
    if (responseDelay) await new Promise((resolve) => setTimeout(resolve, responseDelay));
    if (failNext) {
      failNext = false;
      return Response.json({ message: 'Personas no disponibles (prueba)' }, { status: 503 });
    }
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

const result = document.querySelector<HTMLOutputElement>(
  '[data-testid="people-responsive-result"]',
)!;
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
  const status = document.querySelector('.pagination small')?.textContent || '';
  const pending = status === 'Cargando personas…';
  const debounce = status === 'Esperando búsqueda…';
  const skeletons = table.querySelectorAll('.people-skeleton-row').length;
  const matches = table.querySelectorAll('.person-link').length;
  check(!debounce || (skeletons === 0 && matches === 0), 'debounce sin Skeletons ni datos previos');
  check(!pending || (skeletons === 6 && matches === 0), 'consulta con Skeletons sin datos previos');
  check(
    debounce || pending || !document.querySelector<HTMLElement>('.people-results')?.style.height,
    'altura temporal liberada al resolver',
  );
  const height = document.querySelector('.people-table-panel')!.getBoundingClientRect().height;
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Buscar personas"]');
  const sample = `${input?.value || '(inicial)'} | ${status} | ${height.toFixed(1)}px`;
  if (sample !== lastSample) {
    trace.push(sample);
    lastSample = sample;
    traceOutput.textContent = trace.join('\n');
  }
  if ((debounce || pending) && debounceReference.width === innerWidth) {
    const stable = Math.abs(height - debounceReference.height) < 1;
    const phase = debounce ? 'debounce' : 'consulta pendiente';
    check(stable, `salto de altura durante ${phase}`);
    if (!stable && !transitionFailures.includes(sample)) transitionFailures.push(sample);
    debounceCheck = `; ${phase} ${stable ? 'PASS' : 'FAIL'} ${debounceReference.height.toFixed(1)} → ${height.toFixed(1)}px`;
  }
  // A subsequent page/filter request is not part of the completed search.
  if (!debounce && !pending) debounceReference = { height: 0, width: 0 };
  if (mobile) {
    const panel = document.querySelector<HTMLElement>('.people-table-panel')!;
    check(panel.scrollWidth <= panel.clientWidth + 1, 'scroll horizontal del panel');
    check(table.scrollWidth <= table.clientWidth + 1, 'overflow de tabla');
  }
  for (const row of table.querySelectorAll('tbody tr')) {
    check([...row.children].filter(visible).length === expected.length, 'celdas visibles');
    if (row.classList.contains('people-skeleton-row')) {
      check(row.getAttribute('aria-hidden') === 'true', 'Skeleton decorativo');
      check(!row.querySelector('a,button,input,[tabindex]'), 'Skeleton fuera de tabulación');
      continue;
    }
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
      // Browser zoom/display scaling can round a 12px circle to 11.99px.
      check(
        Math.abs(rect.width - 12) < 0.1 && Math.abs(rect.height - 12) < 0.1,
        'indicador circular de 12px',
      );
    }
  }
  for (const failure of failures) {
    if (!transitionFailures.includes(failure)) transitionFailures.push(failure);
  }
  result.textContent = failures.length
    ? `FAIL ${innerWidth}px: ${[...new Set(failures)].join(', ')}`
    : `PASS ${innerWidth}px: ${expected.length} columnas; layout sin regresión${debounceCheck}`;
}
const scheduleCheck = () => requestAnimationFrame(checkLayout);
new MutationObserver(scheduleCheck).observe(document.getElementById('root')!, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
});
window.addEventListener('resize', scheduleCheck);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Controls />
    <MemoryRouter initialEntries={['/personas']}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
