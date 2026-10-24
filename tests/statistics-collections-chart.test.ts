import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { calculateSummary } from '../server/statistics/engine';
import { statisticsSummarySchema } from '../shared/statistics';
import { collectionsFixture } from './browser/statistics-collections-fixtures';
import StatisticsCollectionsChart from '../client/StatisticsCollectionsChart';
import {
  collectionsReconcile,
  statisticsSummaryQueryOptions,
} from '../client/statistics-collections';

const period = { id: 1, year: 2026, month: 10, status: 'open' as const };
const summary = (scenario: string, id = 1) =>
  calculateSummary(
    {
      period: { ...period, id },
      members: collectionsFixture(scenario, id),
      fees: [],
      expenses: [],
    },
    '2026-10-24T10:00:00.000Z',
  );
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['full', '100.00', '0.00', '0.00', '0.00', '100.00'],
  ['partial', '50.00', '50.00', '0.00', '0.00', '50.00'],
  ['unpaid', '0.00', '100.00', '0.00', '0.00', '0.00'],
  ['zero', '0.00', '0.00', '0.00', '0.00', null],
  ['zero-credit', '0.00', '0.00', '20.00', '0.00', null],
  ['unknown', '0.00', '0.00', '0.00', '0.00', null],
  ['unknown-paid', '0.00', '0.00', '0.00', '20.00', null],
  ['missing', '0.00', '0.00', '0.00', '0.00', null],
  ['overpaid', '100.00', '0.00', '50.00', '0.00', '100.00'],
  ['debt-credit', '100.00', '100.00', '50.00', '0.00', '50.00'],
  ['multiple', '50.00', '50.00', '0.00', '0.00', '50.00'],
  ['rounding', '1.00', '2.00', '0.00', '0.00', '33.33'],
  ['empty', '0.00', '0.00', '0.00', '0.00', null],
])(
  '%s conserva magnitudes y concilia sin compensar personas',
  (scenario, applied, debt, credit, unknown, percentage) => {
    const data = summary(scenario!);
    expect(data.collections).toEqual({
      applied_known: applied,
      collected_undefined: unknown,
      covered_percentage: percentage,
    });
    expect(data.metrics.debt.value).toBe(debt);
    expect(data.metrics.credit.value).toBe(credit);
    expect(collectionsReconcile(data)).toBe(true);
    if (percentage !== null) expect(Number(percentage)).toBeGreaterThanOrEqual(0);
    const html = renderToStaticMarkup(createElement(StatisticsCollectionsChart, { summary: data }));
    expect(html).toContain('del importe total a cobrar');
    expect(html).toContain(
      percentage === null ? 'No calculable' : percentage!.replace('.', ',') + ' %',
    );
    const values = html.match(/<dl class="collections-values"[^>]*>(.*?)<\/dl>/s)![1];
    expect(values).toContain('Cobrado');
    expect(values).toContain('Falta cobrar');
    expect(values).toContain('Total a cobrar');
    expect(values.includes('Saldos a favor')).toBe(credit !== '0.00');
    expect(values.includes('Cobros sin importe a cobrar definido')).toBe(unknown !== '0.00');
    expect(html).not.toContain('fuera de la barra');
    expect(html).toContain('scope="row"');
  },
);

it('cobertura cuenta personas y no movimientos; las ocho métricas conservan sus nombres', () => {
  const data = summary('mixed');
  expect(data.metrics.due).toMatchObject({
    defined: 2,
    undefined: 1,
    missing: 1,
    universe: 4,
    coverage: 'partial',
  });
  expect(data.collections).toEqual({
    applied_known: '70.05',
    collected_undefined: '10.00',
    covered_percentage: '53.84',
  });
  expect(Object.keys(data.metrics)).toEqual([
    'due',
    'collected',
    'debt',
    'credit',
    'fees_committed',
    'fees_paid',
    'fees_pending',
    'expenses',
  ]);
  const html = renderToStaticMarkup(createElement(StatisticsCollectionsChart, { summary: data }));
  expect(html).toContain('Hay 2 personas sin importe a cobrar');
  expect(html.indexOf('El porcentaje se calcula únicamente')).toBeLessThan(
    html.indexOf('collections-canvas'),
  );
  expect(summary('multiple').metrics.collected.universe).toBe(3);
  expect(summary('multiple').metrics.due.universe).toBe(1);
});

it('usa mes y año dinámicos, y advierte una persona sin importe en lenguaje natural', () => {
  const data = summary('unknown-paid');
  data.period.month = 11;
  data.period.year = 2027;
  const html = renderToStaticMarkup(createElement(StatisticsCollectionsChart, { summary: data }));
  expect(html).toContain('Cobros — Noviembre 2027');
  expect(html).toContain('Hay 1 persona sin importe a cobrar');
  expect(html).not.toContain('Base conocida');
  expect(html).not.toContain('Sin cuenta');
  expect(html).not.toContain('cuotas');
});

it('precisión por centavos, bases grandes y porcentaje sin recortes', () => {
  const data = calculateSummary(
    {
      period,
      members: [
        {
          account_id: 1,
          amount_due: '9999999999999999.99',
          paid: '9999999999999999.98',
          payment_count: 2,
        },
      ],
      fees: [],
      expenses: [],
    },
    '2026-10-24T10:00:00.000Z',
  );
  expect(data.collections?.applied_known).toBe('9999999999999999.98');
  expect(data.metrics.debt.value).toBe('0.01');
  expect(collectionsReconcile(data)).toBe(true);
  expect(() =>
    calculateSummary(
      {
        period,
        members: [{ account_id: null, amount_due: null, paid: '1.00', payment_count: 1 }],
        fees: [],
        expenses: [],
      },
      '2026-10-24T10:00:00.000Z',
    ),
  ).toThrow('conciliar');
});

it('no inventa agregados ausentes y rechaza discrepancias, otro período o base cero mal expresada', () => {
  const data = summary('partial');
  delete data.collections;
  expect(statisticsSummarySchema.safeParse(data).success).toBe(true);
  expect(
    renderToStaticMarkup(createElement(StatisticsCollectionsChart, { summary: data })),
  ).toContain('no incluye el detalle');
  for (const mutate of [
    (d: ReturnType<typeof summary>) => {
      d.collections!.applied_known = '49.99';
    },
    (d: ReturnType<typeof summary>) => {
      d.metrics.debt.period_id = 2;
    },
    (d: ReturnType<typeof summary>) => {
      d.metrics.credit.coverage = 'partial';
    },
    (d: ReturnType<typeof summary>) => {
      d.collections!.collected_undefined = '1.00';
    },
    (d: ReturnType<typeof summary>) => {
      d.collections!.covered_percentage = '49.99';
    },
  ]) {
    const invalid = summary('partial');
    mutate(invalid);
    expect(collectionsReconcile(invalid)).toBe(false);
    const html = renderToStaticMarkup(
      createElement(StatisticsCollectionsChart, { summary: invalid }),
    );
    expect(html).toContain('no concilian');
    expect(html).toContain('No calculable');
    expect(html).not.toContain('collections-canvas');
  }
  const zero = summary('zero');
  zero.collections!.covered_percentage = '0.00';
  expect(collectionsReconcile(zero)).toBe(false);
  const invalid = summary('full');
  invalid.collections!.covered_percentage = '100.01';
  expect(statisticsSummarySchema.safeParse(invalid).success).toBe(false);
});

it('consulta validada por período y respuestas tardías no mezclan meses', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveOld!: (response: Response) => void;
  const old = new Promise<Response>((resolve) => {
    resolveOld = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('period_id=1') ? old : Promise.resolve(Response.json(summary('full', 2))),
    ),
  );
  const observer = new QueryObserver(client, statisticsSummaryQueryOptions(1));
  const stop = observer.subscribe(() => {});
  observer.setOptions(statisticsSummaryQueryOptions(2));
  await client.fetchQuery(statisticsSummaryQueryOptions(2));
  resolveOld(Response.json(summary('unpaid', 1)));
  await client.fetchQuery(statisticsSummaryQueryOptions(1));
  expect(observer.getCurrentResult().data?.period.id).toBe(2);
  expect(observer.getCurrentResult().data?.collections?.covered_percentage).toBe('100.00');
  await expect(client.fetchQuery(statisticsSummaryQueryOptions(3))).rejects.toThrow(
    'no corresponde',
  );
  stop();
  client.clear();
});
