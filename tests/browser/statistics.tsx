// Local visual fixture: no backend, credentials or business data.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../client/App';
import { calculateSummary } from '../../server/statistics/engine';
import '../../client/styles.css';
import type { StatisticsExpenseBreakdown } from '../../shared/statistics';
import { feesFixture } from './statistics-fees-fixtures';
import { collectionsFixture } from './statistics-collections-fixtures';
import { useState } from 'react';

const periods = [
  { id: 1, year: 2026, month: 10, status: 'open' as const },
  { id: 2, year: 2026, month: 9, status: 'closed' as const },
];
const scenario = new URLSearchParams(location.search).get('expenses');
const feesScenario = new URLSearchParams(location.search).get('fees');
const collectionsScenario = new URLSearchParams(location.search).get('collections');
// Explicit fixture controls hold real promises: no delay is added to the application.
const manualLoading = new URLSearchParams(location.search).get('loading') === 'manual';
const waiting = new Map<string, () => void>();
let failNextSummary = false;
const fixtureClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 20000, refetchOnWindowFocus: false } },
});
function LoadingControls() {
  const [, update] = useState(0);
  return (
    <details
      open
      aria-label="Controles de prueba de carga"
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 10000,
        width: 'min(360px, 90vw)',
        padding: 12,
        background: '#151a1c',
        border: '1px solid #385158',
        borderRadius: 8,
      }}
    >
      <summary>Controles de prueba de carga</summary>
      <p>QA sintético: las respuestas se liberan manualmente, sin DB.</p>
      {[
        ['/api/statistics/summary:1', 'Liberar resumen octubre'],
        ['/api/statistics/summary:2', 'Liberar resumen septiembre'],
        ['/api/statistics/expenses:1', 'Liberar gastos octubre'],
        ['/api/statistics/expenses:2', 'Liberar gastos septiembre'],
        ['/api/facilitator-accounts:1', 'Liberar honorarios octubre'],
        ['/api/facilitator-accounts:2', 'Liberar honorarios septiembre'],
        ['/api/statistics/inflation:', 'Liberar IPC'],
      ].map(([key, label]) => (
        <button key={key} onClick={() => waiting.get(key)?.()}>
          {label}
        </button>
      ))}
      <button
        onClick={() =>
          void fixtureClient.refetchQueries({ queryKey: ['statistics-summary'], type: 'active' })
        }
      >
        Actualizar resumen
      </button>
      <button
        onClick={() => {
          failNextSummary = true;
          update((n) => n + 1);
        }}
      >
        Fallar próximo resumen{failNextSummary ? ' (activado)' : ''}
      </button>
    </details>
  );
}
// Fixture-only emulation: validate both motion modes independently of the host OS.
const motionScenario = new URLSearchParams(location.search).get('motion');
if (scenario === 'reduced' || motionScenario === 'normal' || motionScenario === 'reduced') {
  const browserMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) =>
    query === '(prefers-reduced-motion: reduce)'
      ? {
          matches: motionScenario !== 'normal',
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => true,
        }
      : browserMatchMedia(query);
}
// Synthetic and read-only; scenario URLs exercise loading/error/race states without a DB.
const expenseFixture = (period: (typeof periods)[number]): StatisticsExpenseBreakdown => {
  const empty = scenario === 'empty' || period.id === 2;
  if (!empty && (scenario === 'many14' || scenario === 'many20')) {
    const count = scenario === 'many14' ? 14 : 20;
    const categories = Array.from({ length: count }, (_, i) => ({
      category_id: i + 1,
      category_name: i < 6 ? `Concepto recurrente ${i + 1}` : `Categoría adicional ${i - 5}`,
      recurring_concept_name: i < 6 ? `Concepto recurrente ${i + 1}` : null,
      amount: `${(count - i) * 1000}.00`,
      movement_count: 1,
    }));
    return {
      period,
      recurring: {
        categories: categories.slice(0, 6),
        movement_count: 6,
        subtotal: `${(6 * count - 15) * 1000}.00`,
      },
      additional: {
        categories: categories.slice(6),
        movement_count: count - 6,
        subtotal: `${(((count - 6) * (count - 5)) / 2) * 1000}.00`,
      },
      total: `${((count * (count + 1)) / 2) * 1000}.00`,
      movement_count: count,
    };
  }
  return {
    period,
    recurring: {
      subtotal: empty ? '0.00' : '850000.53',
      movement_count: empty ? 0 : 2,
      categories: empty
        ? []
        : [
            {
              category_id: 1,
              category_name: 'Alquiler',
              recurring_concept_name: 'Alquiler',
              amount: '600000.53',
              movement_count: 1,
            },
            {
              category_id: 2,
              category_name: 'Servicios del inmueble y mantenimiento general',
              recurring_concept_name: 'Servicios del inmueble y mantenimiento general',
              amount: '250000.00',
              movement_count: 1,
            },
          ],
    },
    additional: {
      subtotal: empty ? '0.00' : '48000.75',
      movement_count: empty ? 0 : 3,
      categories: empty
        ? []
        : [
            {
              category_id: 3,
              category_name: 'Materiales para actividades',
              recurring_concept_name: null,
              amount: '12000.25',
              movement_count: 1,
            },
            {
              category_id: 4,
              category_name: 'Difusión y comunicación',
              recurring_concept_name: null,
              amount: '36000.50',
              movement_count: 2,
            },
          ],
    },
    total: empty ? '0.00' : '898001.28',
    movement_count: empty ? 0 : 5,
  };
};
window.fetch = async (input, init) => {
  if (init?.method && init.method !== 'GET') throw Error('QA: writes blocked');
  const url = new URL(String(input), location.href);
  if (manualLoading && url.pathname !== '/api/periods') {
    const key = `${url.pathname}:${url.searchParams.get('period_id') ?? ''}`;
    await new Promise<void>((resolve) => {
      waiting.set(key, () => {
        waiting.delete(key);
        resolve();
      });
    });
  }
  if (url.pathname === '/api/facilitator-accounts') {
    const period = Number(url.searchParams.get('period_id'));
    if (feesScenario === 'slow')
      await new Promise((resolve) => setTimeout(resolve, period === 1 ? 2500 : 50));
    return Response.json(feesFixture(period, feesScenario).accounts);
  }
  if (url.pathname === '/api/periods') return Response.json(periods);
  if (url.pathname === '/api/statistics/expenses') {
    const period = periods.find((p) => p.id === Number(url.searchParams.get('period_id')))!;
    if (scenario === 'slow')
      await new Promise((resolve) => setTimeout(resolve, period.id === 1 ? 2500 : 50));
    if (scenario === 'error')
      return Response.json({ message: 'Gastos no disponibles (prueba)' }, { status: 503 });
    return Response.json(expenseFixture(period));
  }
  if (url.pathname === '/api/statistics/inflation')
    return Response.json({
      status: 'verified',
      origin: 'live',
      snapshot: {
        reference_period: '2026-09',
        monthly: '1.9',
        year_to_date: '23.6',
        year_over_year: '33.4',
        published_at: '2026-10-13',
        verified_at: '2026-10-22',
        source: 'INDEC · IPC nacional, nivel general',
        source_url: 'https://www.indec.gob.ar/uploads/informesdeprensa/ipc_10_268C45A9444C.pdf',
        series_url: 'https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv',
      },
    });
  if (url.pathname === '/api/statistics/summary') {
    if (failNextSummary) {
      failNextSummary = false;
      return Response.json({ message: 'Resumen no disponible (prueba)' }, { status: 503 });
    }
    const period = periods.find((p) => p.id === Number(url.searchParams.get('period_id')))!;
    if (collectionsScenario === 'slow')
      await new Promise((resolve) => setTimeout(resolve, period.id === 1 ? 2500 : 50));
    if (collectionsScenario === 'error')
      return Response.json({ message: 'Cobranzas no disponibles (prueba)' }, { status: 503 });
    const summary = calculateSummary(
      {
        period,
        members: collectionsScenario
          ? collectionsFixture(collectionsScenario, period.id)
          : [
              { account_id: 1, amount_due: '1234567.89', paid: '900000.00', payment_count: 12 },
              { account_id: 2, amount_due: '100.00', paid: '150.00', payment_count: 1 },
              { account_id: null, amount_due: null, paid: '0.00', payment_count: 0 },
            ],
        fees: feesFixture(period.id, feesScenario).balances,
        expenses:
          scenario === 'mismatch'
            ? [{ amount: '85000.50' }]
            : scenario === 'empty' || period.id === 2
              ? []
              : scenario === 'many14' || scenario === 'many20'
                ? [
                    ...expenseFixture(period).recurring.categories,
                    ...expenseFixture(period).additional.categories,
                  ]
                : [
                    { amount: '600000.53' },
                    { amount: '250000.00' },
                    { amount: '12000.25' },
                    { amount: '18000.25' },
                    { amount: '18000.25' },
                  ],
      },
      '2026-10-22T15:00:00.000Z',
    );
    if (feesScenario === 'mismatch') summary.metrics.fees_paid.value = '0.01';
    if (collectionsScenario === 'mismatch') summary.collections!.applied_known = '0.01';
    if (collectionsScenario === 'legacy') delete summary.collections;
    return Response.json(summary);
  }
  throw Error(`Unexpected QA request: ${url.pathname}`);
};
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={fixtureClient}>
    {manualLoading && <LoadingControls />}
    <MemoryRouter initialEntries={['/estadisticas']}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
