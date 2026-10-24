import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  expenseChartRows,
  expenseQueryOptions,
  statisticsExpenseKey,
} from '../client/statistics-expenses';
import StatisticsExpenseChart, {
  ExpenseVisualization,
  ExpenseChartInformation,
} from '../client/StatisticsExpenseChart';
import { calculateSummary } from '../server/statistics/engine';
import type { StatisticMetric, StatisticsExpenseBreakdown } from '../shared/statistics';

const period = { id: 1, year: 2026, month: 10, status: 'open' as const };
const category = (id: number, amount: string, name: string) => ({
  category_id: id,
  category_name: name,
  recurring_concept_name: null,
  amount,
  movement_count: 1,
});
const data: StatisticsExpenseBreakdown = {
  period,
  recurring: {
    subtotal: '300.00',
    movement_count: 1,
    categories: [
      { ...category(1, '300.00', 'Categoría original'), recurring_concept_name: 'Alquiler' },
    ],
  },
  additional: {
    subtotal: '400.03',
    movement_count: 2,
    categories: [category(2, '100.01', 'Insumos'), category(3, '300.02', 'Publicidad')],
  },
  total: '700.03',
  movement_count: 3,
};
const metric: StatisticMetric = {
  value: data.total,
  universe: 3,
  defined: 3,
  undefined: 0,
  missing: 0,
  coverage: 'complete',
  period_id: 1,
  time_axis: 'economic_period',
  source: ['period_expenses'],
  warnings: [],
};
afterEach(() => vi.unstubAllGlobals());

it('ordena globalmente por importe exacto sin mutar la respuesta ni confundir nombres o tipos', () => {
  const original = structuredClone(data);
  const rows = expenseChartRows(data);
  expect(rows.map((r) => [r.name, r.kind, r.amount])).toEqual([
    ['Publicidad', 'Adicional', '300.02'],
    ['Alquiler', 'Recurrente', '300.00'],
    ['Insumos', 'Adicional', '100.01'],
  ]);
  expect(data).toEqual(original);
  const large = {
    ...data,
    recurring: {
      ...data.recurring,
      categories: [
        category(4, '99999999999999999.01', 'A'),
        category(5, '99999999999999999.02', 'B'),
      ],
    },
    additional: { ...data.additional, categories: [] },
  };
  expect(expenseChartRows(large).map((r) => r.category_id)).toEqual([5, 4]);
});

it('tabla conserva centavos, clasificación, nombre completo, orden y total del backend', () => {
  const html = renderToStaticMarkup(createElement(ExpenseVisualization, { data }));
  expect(html).toContain('Importes registrados · ARS');
  expect(html).toContain('Información de Composición de gastos');
  expect(html).not.toContain('Ver tabla');
  expect(html).not.toContain('<details');
  expect(html).toContain('class="expense-chart-sr-only"');
  expect(html).not.toContain('Ver tabla de valores exactos');
  expect(html).not.toContain('Explorá las barras');
  expect(html).toContain('scope="row"');
  expect(html).toContain('$ 700,03');
  expect(html).toContain('$ 300,02');
  expect(html).toContain('Categoría original');
  expect(html).toContain('Recurrente');
  expect(html.indexOf('Publicidad')).toBeLessThan(html.indexOf('Alquiler'));
});

it('vacío no inventa categorías ni obligaciones iguales a cero', () => {
  const empty = {
    ...data,
    recurring: { subtotal: '0.00', movement_count: 0, categories: [] },
    additional: { subtotal: '0.00', movement_count: 0, categories: [] },
    total: '0.00',
    movement_count: 0,
  };
  const html = renderToStaticMarkup(createElement(ExpenseVisualization, { data: empty }));
  expect(html).toContain('Sin movimientos de gastos');
  expect(html).not.toContain('<table');
  expect(html).not.toContain('Alquiler');
});

function renderPanel(state: 'loading' | 'error' | 'mismatch' | 'success') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (state !== 'loading') client.setQueryData(statisticsExpenseKey(1), data);
  if (state === 'error')
    client
      .getQueryCache()
      .find({ queryKey: statisticsExpenseKey(1) })!
      .setState({ status: 'error', error: new Error('Consulta fallida') });
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(StatisticsExpenseChart, {
        period: 1,
        summary: calculateSummary(
          { period, members: [], fees: [], expenses: [] },
          '2026-10-23T10:00:00.000Z',
        ),
        metric: { ...metric, value: state === 'mismatch' ? '999.00' : data.total },
        refreshSummary: () => {},
      }),
    ),
  );
  client.clear();
  return html;
}
it('distingue carga, error y lecturas desactualizadas sin presentarlas como cero', () => {
  expect(renderPanel('loading')).toContain('Cargando');
  for (const state of ['loading', 'error', 'mismatch', 'success'] as const) {
    expect(renderPanel(state).match(/<article class="expense-analysis-tile/g)).toHaveLength(2);
  }
  const error = renderPanel('error');
  expect(error).toContain('Consulta fallida');
  expect(error).not.toContain('<table');
  expect(renderPanel('mismatch')).toContain('lecturas diferentes');
  const success = renderPanel('success');
  expect(success).not.toContain('lecturas diferentes');
  expect(success).toContain('Información de Composición de gastos');
  const information = renderToStaticMarkup(createElement(ExpenseChartInformation));
  expect(information).toContain('no acreditan pagos realizados');
  expect(information).toContain('ni demuestra que la carga esté completa');
});

it.each([14, 20])(
  'representa las %i categorías sin Top N y conserva el total completo',
  (count) => {
    const categories = Array.from({ length: count }, (_, i) => ({
      ...category(i + 1, '100.00', `Categoría ${i + 1}`),
      recurring_concept_name: i < 6 ? `Concepto ${i + 1}` : null,
    }));
    const complete = {
      ...data,
      recurring: { subtotal: '600.00', movement_count: 6, categories: categories.slice(0, 6) },
      additional: {
        subtotal: `${(count - 6) * 100}.00`,
        movement_count: count - 6,
        categories: categories.slice(6),
      },
      total: `${count * 100}.00`,
      movement_count: count,
    };
    const rows = expenseChartRows(complete);
    expect(rows).toHaveLength(count);
    expect(rows.reduce((sum, row) => sum + BigInt(row.amount.replace('.', '')), 0n)).toBe(
      BigInt(count) * 10000n,
    );
    const html = renderToStaticMarkup(createElement(ExpenseVisualization, { data: complete }));
    const body = html.split('<tbody>')[1].split('</tbody>')[0];
    expect(body.match(/<tr>/g)).toHaveLength(count);
    expect(html).toContain(`height:${count * 32 + 40}px`);
    expect(html).toContain('Concepto 6');
    expect(html).toContain(`Categoría ${count}`);
  },
);

it('valida el período recibido y comparte la consulta existente sin escrituras', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetch = vi.fn(async () => Response.json(data));
  vi.stubGlobal('fetch', fetch);
  expect(await client.fetchQuery(expenseQueryOptions(1))).toEqual(data);
  expect(fetch.mock.calls).toHaveLength(1);
  await expect(client.fetchQuery(expenseQueryOptions(2))).rejects.toThrow('no corresponde');
  client.clear();
});

it('cambio de período y respuesta tardía no mezclan datos del gráfico', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveOld!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    resolveOld = resolve;
  });
  const next = { ...data, period: { ...period, id: 2 }, total: '55.00' };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('period_id=1') ? delayed : Promise.resolve(Response.json(next)),
    ),
  );
  const observer = new QueryObserver(client, expenseQueryOptions(1));
  const stop = observer.subscribe(() => {});
  observer.setOptions(expenseQueryOptions(2));
  await client.fetchQuery(expenseQueryOptions(2));
  resolveOld(Response.json(data));
  await client.fetchQuery(expenseQueryOptions(1));
  expect(observer.getCurrentResult().data?.period.id).toBe(2);
  expect(observer.getCurrentResult().data?.total).toBe('55.00');
  stop();
  client.clear();
});
