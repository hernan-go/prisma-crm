// Six screens, in-memory responses only. No credentials, backend or writes.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../client/App';
import '../../client/styles.css';

const params = new URLSearchParams(location.search);
const manual = params.get('manual') === '1';
const screen = params.get('screen') || '/pagos';
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 20000, refetchOnWindowFocus: false } },
});
type Mode = 'ready' | 'empty' | 'error';
const waiting = new Map<string, (mode: Mode) => void>();
const requests: string[] = [];
let pickerHeight = 0;
let pickerDialogHeight = 0;
const pickerFailures: string[] = [];
const pickerTrace: string[] = [];
document.addEventListener(
  'input',
  (event) => {
    if (
      !(event.target instanceof HTMLInputElement) ||
      event.target.getAttribute('aria-label') !== 'Buscar personas'
    )
      return;
    const results = document.querySelector<HTMLElement>('.pick-list');
    if (results && results.getAttribute('aria-busy') !== 'true') {
      pickerHeight = results.getBoundingClientRect().height;
      pickerDialogHeight =
        document.querySelector('dialog[open]')?.getBoundingClientRect().height || 0;
    }
  },
  true,
);
async function exercisePicker(interval: number) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Buscar personas"]')!;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  pickerFailures.length = 0;
  pickerTrace.length = 0;
  for (const value of ['A', 'An', 'Ana', 'nadie']) {
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // Synthetic network response; application timers and requests stay untouched.
    setTimeout(
      () =>
        [...waiting]
          .filter(([key]) => key.startsWith('/people?'))
          .forEach(([, resolve]) => resolve('ready')),
      280,
    );
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  document.querySelector('[data-testid="picker-result"]')!.textContent =
    `${pickerFailures.length ? 'FAIL' : 'PASS'} búsqueda ${interval}ms\n${pickerTrace.join('\n')}`;
}
const notify = () => window.dispatchEvent(new Event('fixture-request'));
const periods = [
  { id: 1, year: 2026, month: 10, status: 'open' },
  { id: 2, year: 2026, month: 11, status: 'open' },
];
function payload(url: URL, empty: boolean): unknown {
  const path = url.pathname.replace(/^\/api/, '');
  const period = Number(
    url.searchParams.get('period_id') || path.match(/\/periods\/(\d+)/)?.[1] || 1,
  );
  const month = period === 1 ? 'Octubre' : 'Noviembre';
  const person = {
    id: 1,
    person_id: 1,
    membership_id: period * 10,
    nombre: `Ana ${month}`,
    apellido: 'Sintética',
    public_id: 'QA-001',
    telefono: '3410000000',
    activo: 1,
    activities: `Yoga ${month}`,
  };
  const payment = {
    id: period,
    person_id: 1,
    nombre: person.nombre,
    apellido: person.apellido,
    amount: '25.00',
    date: `2026-${period === 1 ? '10' : '11'}-01`,
    recipient: 'jesica',
    method: 'cash',
    notes: '',
  };
  if (path === '/people')
    return {
      rows: empty || (url.searchParams.get('q') || '').includes('nadie') ? [] : [person],
      total: empty ? 0 : 1,
    };
  if (path.includes('recurring-expenses'))
    return {
      revision: '1',
      tiles: empty
        ? []
        : [
            {
              id: 1,
              name: `Alquiler ${month}`,
              icon_name: 'house',
              position: 1,
              revision: '1',
              category_id: 2,
              category_name: null,
              status: 'single',
              amount: '30.00',
              expenses: [
                { id: 2, concept: 'Alquiler', date: payment.date, amount: '30.00', notes: '' },
              ],
            },
          ],
    };
  if (path === '/dashboard')
    return {
      people: empty ? 0 : 7,
      enrollments: empty ? 0 : 9,
      due: empty ? '0' : '100',
      paid: empty ? '0' : '25',
      pending: empty ? '0' : '75',
      credit: '0',
      undefined_accounts: 0,
      activities: empty ? [] : [{ name: `Yoga ${month}`, count: 9 }],
      wallets: {
        jesica: { cash: empty ? '0' : '25', transfer: '0', total: empty ? '0' : '25' },
        hernan: { cash: '0', transfer: '0', total: '0' },
      },
    };
  if (empty) return [];
  if (path === '/accounts')
    return [{ ...person, id: period, amount_due: '100.00', paid: '25.00', balance: '75.00' }];
  if (path === '/payments' || /^\/facilitator-accounts\/\d+\/payments$/.test(path))
    return [payment];
  if (/\/memberships$/.test(path)) return [person];
  if (path === '/enrollments')
    return [{ id: period, activity: `Yoga ${month}`, mode: 'group', slots: [] }];
  if (path === '/facilitator-accounts')
    return [
      {
        id: 100 + period,
        offering_id: period,
        instructor_id: period,
        instructor: `Facilitadora ${month}`,
        activity: `Yoga ${month}`,
        assigned: true,
        amount_due: '100',
        paid: '25',
        pending: '75',
        notes: '',
      },
    ];
  if (/\/expense-categories$/.test(path))
    return [
      {
        id: period,
        name: `Materiales ${month}`,
        recurring_concept_id: null,
        expenses: [
          {
            id: period,
            concept: 'Material sintético',
            amount: '15.00',
            date: payment.date,
            notes: '',
          },
        ],
      },
    ];
  if (path === '/expense-recurring-concepts')
    return [{ id: 1, name: 'Alquiler', icon_name: 'house', active: true }];
  if (path === '/agenda')
    return Array.from({ length: 7 }, (_, day) => ({
      id: period * 10 + day,
      period_id: period,
      activity_id: period,
      activity: `Yoga ${month}`,
      active: 1,
      offered: 1,
      catalog_active: 1,
      day,
      start: '10:00',
      end: '11:00',
      instructors: [{ id: period, name: `Facilitadora ${month}` }],
      people: [person],
    }));
  throw Error(`Fixture: unexpected request ${path}`);
}
window.fetch = async (input, init) => {
  if (init?.method && init.method !== 'GET') throw Error('Fixture: writes blocked');
  const url = new URL(String(input), location.href);
  const path = url.pathname.replace(/^\/api/, '');
  if (path === '/periods') return Response.json(periods);
  if (path === '/weather') return Response.json({ weather: null });
  const key = path + url.search;
  requests.push(key);
  let mode: Mode = 'ready';
  if (manual)
    mode = await new Promise<Mode>((resolve) => {
      waiting.set(key, (next) => {
        waiting.delete(key);
        resolve(next);
        notify();
      });
      notify();
    });
  return mode === 'error'
    ? Response.json({ message: `Error sintético ${key}` }, { status: 503 })
    : Response.json(payload(url, mode === 'empty'));
};
function Controls() {
  const [, update] = useState(0);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    const refresh = () => update((n) => n + 1);
    window.addEventListener('fixture-request', refresh);
    return () => window.removeEventListener('fixture-request', refresh);
  }, []);
  useEffect(() => {
    // Native modal dialogs make outside controls inert. Keep fixture controls usable inside them.
    const refresh = () => setDialog(document.querySelector<HTMLDialogElement>('dialog[open]'));
    const observer = new MutationObserver(refresh);
    observer.observe(document.getElementById('root')!, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    refresh();
    return () => observer.disconnect();
  }, []);
  const controls = (
    <details
      open
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 10000,
        width: 'min(480px, 94vw)',
        maxHeight: '45vh',
        overflow: 'auto',
        background: '#151a1c',
        border: '1px solid #385158',
        padding: 10,
      }}
    >
      <summary>QA · Respuestas sintéticas</summary>
      <button onClick={() => [...waiting.values()].forEach((resolve) => resolve('ready'))}>
        Resolver todas
      </button>
      <button
        onClick={() =>
          void client.refetchQueries({
            type: 'active',
            predicate: (q) => !['periods', 'weather'].includes(String(q.queryKey[0])),
          })
        }
      >
        Actualizar pantalla
      </button>
      {dialog && (
        <>
          <button onClick={() => void exercisePicker(450)}>Probar búsqueda lenta</button>
          <button onClick={() => void exercisePicker(50)}>Probar búsqueda rápida</button>
          <pre data-testid="picker-result" />
        </>
      )}
      {[...waiting.keys()].map((key) => (
        <div key={key}>
          <small>{key}</small>
          {(['ready', 'empty', 'error'] as const).map((mode) => (
            <button key={mode} onClick={() => waiting.get(key)?.(mode)}>
              {mode} {key}
            </button>
          ))}
        </div>
      ))}
      <output data-testid="request-log">{requests.join('\n')}</output>
    </details>
  );
  return dialog ? createPortal(controls, dialog) : controls;
}
const check = () => {
  const failures: string[] = [];
  const picker = document.querySelector<HTMLElement>('.pick-list');
  if (picker && pickerHeight && picker.getAttribute('aria-busy') === 'true') {
    const height = picker.getBoundingClientRect().height;
    const sample = `${document.querySelector<HTMLInputElement>('input[aria-label="Buscar personas"]')?.value}: ${height.toFixed(1)}px`;
    if (pickerTrace.at(-1) !== sample) pickerTrace.push(sample);
    if (Math.abs(height - pickerHeight) >= 1) pickerFailures.push(sample);
    const dialogHeight =
      document.querySelector('dialog[open]')?.getBoundingClientRect().height || 0;
    if (Math.abs(dialogHeight - pickerDialogHeight) >= 1)
      pickerFailures.push(`salto del diálogo: ${pickerDialogHeight} → ${dialogHeight}`);
  }
  failures.push(...pickerFailures);
  if (document.documentElement.scrollWidth > innerWidth) failures.push('overflow del documento');
  if (document.querySelector('tbody > :not(tr)')) failures.push('semántica de tabla');
  if (
    document.querySelector('.skeleton-shape a, .skeleton-shape button, .skeleton-shape [tabindex]')
  )
    failures.push('Skeleton interactivo');
  const result = document.querySelector('[data-testid="layout-result"]')!;
  result.textContent = `${failures.length ? 'FAIL' : 'PASS'} ${innerWidth}px ${failures.join(', ')}`;
};
new MutationObserver(() => requestAnimationFrame(check)).observe(document.getElementById('root')!, {
  subtree: true,
  childList: true,
  characterData: true,
});
window.addEventListener('resize', check);
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Controls />
    <MemoryRouter initialEntries={[screen]}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
