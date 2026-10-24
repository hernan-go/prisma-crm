import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { PeriodContext } from '../client/App';
import { Statistics, inflationKey } from '../client/Statistics';
import { StatisticsFeesChart } from '../client/StatisticsFeesChart';
import StatisticsExpenseChart from '../client/StatisticsExpenseChart';
import { statisticsKey, statisticsSummaryQueryOptions } from '../client/statistics-collections';
import { calculateSummary } from '../server/statistics/engine';
import { verifiedInflation } from '../server/statistics/inflation';
import { readFileSync } from 'node:fs';

const periods = [
  { id: 1, year: 2026, month: 10, status: 'open' as const },
  { id: 2, year: 2026, month: 11, status: 'open' as const },
];
const summary = (id = 1, empty = false) =>
  calculateSummary(
    {
      period: periods[id - 1],
      members: empty
        ? []
        : [{ account_id: 1, amount_due: '100.00', paid: '25.00', payment_count: 1 }],
      fees: [],
      expenses: [],
    },
    '2026-10-24T10:00:00.000Z',
  );
const clients: QueryClient[] = [];
function client() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
  });
  clients.push(qc);
  return qc;
}
function render(qc: QueryClient, period = 1) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(
        PeriodContext.Provider,
        { value: { period, periods } },
        createElement(Statistics),
      ),
    ),
  );
}
afterEach(() => {
  clients.splice(0).forEach((qc) => qc.clear());
  vi.unstubAllGlobals();
});

it('el CSS oficial instalado conserva las formas y desactiva Shimmer con movimiento reducido', () => {
  const css = readFileSync(
    new URL('../node_modules/react-loading-skeleton/dist/skeleton.css', import.meta.url),
    'utf8',
  );
  expect(css).toMatch(
    /@media\s*\(prefers-reduced-motion\)\s*\{\s*\.react-loading-skeleton\s*\{\s*--pseudo-element-display:\s*none/,
  );
  expect(css).toContain('display: var(--pseudo-element-display)');
  expect(css).toContain('background-color: var(--base-color)');
});

it('sin caché conserva seis KPI y cabeceras; no inventa cifras ni controles de ayuda', () => {
  const html = render(client());
  expect(html.match(/<article class="statistics-card /g)).toHaveLength(6);
  expect(html).toContain('Ingresos y cobranzas');
  expect(html).toContain('Gastos operativos y honorarios');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('Cargando estadísticas');
  expect(html).not.toContain('$ ');
  expect(html).not.toContain('Información de Total a cobrar');
  // Each primitive's vendor live region is inside an aria-hidden decorative wrapper.
  expect(html).toContain('class="skeleton-shape" aria-hidden="true"');
});

it('un mes sin caché oculta el anterior y mantiene el IPC válido independiente', () => {
  const qc = client();
  qc.setQueryData(statisticsKey(1), summary());
  qc.setQueryData(inflationKey, {
    status: 'verified',
    origin: 'live',
    snapshot: verifiedInflation,
  });
  expect(render(qc)).toContain('$ 100,00');
  const other = render(qc, 2);
  expect(other).not.toContain('$ 100,00');
  expect(other).toContain('Cargando estadísticas');
  expect(other).toContain('1,9 %');
  expect(other).not.toContain('Consultando IPC oficial');
  expect(render(qc)).not.toContain('Cargando estadísticas');
});

it('fetch en segundo plano y su error conservan los datos; error sin datos y vacío son distintos', () => {
  const qc = client();
  qc.setQueryData(statisticsKey(1), summary());
  const query = qc.getQueryCache().find({ queryKey: statisticsKey(1) })!;
  query.setState({ fetchStatus: 'fetching' });
  expect(render(qc)).toContain('Actualizando estadísticas');
  expect(render(qc)).toContain('$ 100,00');
  expect(render(qc)).not.toContain('Cargando estadísticas');
  query.setState({
    fetchStatus: 'idle',
    status: 'error',
    error: new Error('Error de actualización'),
  });
  expect(render(qc)).toContain('$ 100,00');
  expect(render(qc)).toContain('Error de actualización');
  expect(render(qc)).toContain('Reintentar');
  query.setState({ data: undefined });
  expect(render(qc)).not.toContain('react-loading-skeleton');
  expect(render(qc)).not.toContain('$ 100,00');
  qc.setQueryData(statisticsKey(1), summary(1, true));
  expect(render(qc)).toContain('Este período no tiene');
  expect(render(qc)).not.toContain('Cargando estadísticas');
});

it('las consultas de gráficos muestran skeleton, vacío o error sin confundir estados', () => {
  const qc = client();
  const fees = () =>
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(StatisticsFeesChart, { summary: summary(), refreshSummary: () => {} }),
      ),
    );
  expect(fees()).toContain('Cargando honorarios');
  qc.setQueryData(['facilitator-accounts', 1], []);
  expect(fees()).toContain('Sin facilitadores');
  expect(fees()).not.toContain('react-loading-skeleton');
  const expenses = () =>
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(StatisticsExpenseChart, {
          period: 1,
          metric: summary().metrics.expenses,
          summary: summary(),
          refreshSummary: () => {},
        }),
      ),
    );
  expect(expenses()).toContain('Cargando gastos');
  qc.getQueryCache()
    .find({ queryKey: ['statistics-expenses', 1] })!
    .setState({ status: 'error', error: new Error('Gastos no disponibles') });
  expect(expenses()).toContain('Gastos no disponibles');
  expect(expenses()).not.toContain('Cargando gastos');
});

it('cambio rápido y respuesta tardía no reemplazan el período actual; volver usa caché', async () => {
  const qc = client();
  let release!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('period_id=1') ? delayed : Promise.resolve(Response.json(summary(2))),
    ),
  );
  const observer = new QueryObserver(qc, statisticsSummaryQueryOptions(1));
  const stop = observer.subscribe(() => {});
  expect(render(qc)).toContain('Cargando estadísticas');
  observer.setOptions(statisticsSummaryQueryOptions(2));
  await qc.fetchQuery(statisticsSummaryQueryOptions(2));
  release(Response.json(summary()));
  await qc.fetchQuery(statisticsSummaryQueryOptions(1));
  expect(observer.getCurrentResult().data?.period.id).toBe(2);
  expect(render(qc, 2)).not.toContain('Cargando estadísticas');
  expect(render(qc, 1)).not.toContain('Cargando estadísticas');
  stop();
});
