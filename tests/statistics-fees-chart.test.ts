import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import {
  facilitatorChartRows,
  facilitatorQueryOptions,
  reconcileFacilitatorAccounts,
} from '../client/statistics-fees';
import { StatisticsFeesChart } from '../client/StatisticsFeesChart';
import { facilitatorPending, type FacilitatorAccount } from '../shared/facilitators';
import { calculateSummary } from '../server/statistics/engine';
import { feesFixture } from './browser/statistics-fees-fixtures';

afterEach(() => vi.unstubAllGlobals());
const account = (id: number, due: string | null, paid: string): FacilitatorAccount => ({
  id,
  instructor_id: id,
  offering_id: id,
  instructor: 'Facilitador ' + id,
  activity: 'Actividad',
  amount_due: due,
  paid,
  pending: facilitatorPending(due, paid),
  notes: '',
  assigned: 1,
});
it.each([5, 6])('genera %i porciones para facilitadores distintos', (count) =>
  expect(
    facilitatorChartRows(Array.from({ length: count }, (_, i) => account(i + 1, '100.00', '0.00'))),
  ).toHaveLength(count),
);
it('agrupa actividades de una misma persona sin perder centavos', () => {
  const rows = facilitatorChartRows([
    account(1, '100.01', '50.00'),
    { ...account(1, '99.99', '50.00'), offering_id: 2 },
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ due: '200.00', paid: '100.00', fraction: 0.5 });
});
it.each([
  ['0.00', 0],
  ['50.00', 0.5],
  ['100.00', 1],
])('relleno individual para pago %s', (paid, fraction) =>
  expect(facilitatorChartRows([account(1, '100.00', paid as string)])[0].fraction).toBe(fraction),
);
it.each([
  [null, '20.00'],
  ['0.00', '0.00'],
  ['100.00', '120.00'],
])('no inventa proporción sin base válida', (due, paid) => {
  const row = facilitatorChartRows([account(1, due, paid!)])[0];
  expect(row.fraction).toBe(0);
  expect(row.warning).toBeTruthy();
});

const period = { id: 1, year: 2026, month: 10, status: 'open' as const };
function summaryFor(accounts: FacilitatorAccount[]) {
  return calculateSummary(
    {
      period,
      members: [],
      fees: accounts.map((a) => ({
        account_id: a.id,
        amount_due: a.amount_due,
        paid: a.paid,
        payment_count: a.paid === '0.00' ? 0 : 1,
      })),
      expenses: [],
    },
    '2026-10-23T18:00:00.000Z',
  );
}

it.each([
  'empty',
  'single',
  'few',
  'many',
  'unpaid',
  'half',
  'full',
  'multiple-payments',
  'unknown',
  'zero',
  'overpaid',
  'incomplete',
])('fixture %s concilia cuentas y resumen en ambos períodos', (scenario) => {
  for (const id of [1, 2]) {
    const fixture = feesFixture(id, scenario);
    const summary = calculateSummary(
      { period: { ...period, id }, members: [], fees: fixture.balances, expenses: [] },
      '2026-10-23T18:00:00.000Z',
    );
    expect(reconcileFacilitatorAccounts(fixture.accounts, summary)).toEqual([]);
  }
});

it('conserva subtotales por cuenta aunque una persona tenga actividades desconocidas', () => {
  const accounts = [
    account(1, '100.01', '50.00'),
    { ...account(2, null, '20.00'), instructor_id: 1 },
    { ...account(3, null, '0.00'), id: null },
  ];
  const summary = summaryFor(accounts);
  expect(facilitatorChartRows(accounts)[0].due).toBeNull();
  expect(summary.metrics.fees_committed.value).toBe('100.01');
  expect(summary.metrics.fees_paid.value).toBe('70.00');
  expect(summary.metrics.fees_pending.value).toBe('50.01');
  expect(reconcileFacilitatorAccounts(accounts, summary)).toEqual([]);
  expect(summary.metrics.fees_committed).toMatchObject({ defined: 1, undefined: 1, missing: 1 });
});

it('no compensa sobrepagos entre actividades del mismo facilitador', () => {
  const accounts = [
    account(1, '100.00', '120.00'),
    { ...account(2, '100.00', '0.00'), instructor_id: 1 },
  ];
  const summary = summaryFor(accounts);
  expect(summary.metrics.fees_pending.value).toBe('100.00');
  expect(summary.fees_overpaid).toEqual({ count: 1, excess: '20.00' });
  expect(facilitatorChartRows(accounts)[0].fraction).toBe(0);
  expect(reconcileFacilitatorAccounts(accounts, summary)).toEqual([]);
});

it.each([
  ['fees_committed', 'A pagar conocido'],
  ['fees_paid', 'Pagado'],
  ['fees_pending', 'Pendiente conocido'],
] as const)('detecta un centavo de discrepancia en %s', (key, label) => {
  const accounts = [account(1, '99999999999999.99', '0.00')];
  const summary = summaryFor(accounts);
  summary.metrics[key].value = key === 'fees_paid' ? '0.01' : '99999999999999.98';
  expect(reconcileFacilitatorAccounts(accounts, summary)).toContain(label);
});

it('detecta diferencias de cobertura y sobrepagos con iguales subtotales', () => {
  const accounts = [account(1, '0.00', '0.00')];
  const summary = summaryFor(accounts);
  summary.metrics.fees_committed.coverage = 'partial';
  summary.fees_overpaid = { count: 1, excess: '0.01' };
  expect(reconcileFacilitatorAccounts(accounts, summary)).toEqual([
    'Cobertura de honorarios',
    'Sobrepagos',
  ]);
});

it('no interpreta pendiente desconocido ni metadatos de otro período como conciliados', () => {
  const accounts = [account(1, '100.00', '0.00')];
  const summary = summaryFor(accounts);
  expect(reconcileFacilitatorAccounts([{ ...accounts[0], pending: null }], summary)).toContain(
    'Pendiente no comparable',
  );
  summary.metrics.fees_pending.period_id = 2;
  expect(reconcileFacilitatorAccounts(accounts, summary)).toEqual([
    'Período de referencia de honorarios',
  ]);
});

it('varios pagos parciales concilian sin comparar cantidad de pagos con cantidad de cuentas', () => {
  const fixture = feesFixture(1, 'multiple-payments');
  const summary = calculateSummary(
    { period, members: [], fees: fixture.balances, expenses: [] },
    '2026-10-23T18:00:00.000Z',
  );
  expect(summary.metrics.fees_paid.universe).toBe(3);
  expect(fixture.accounts).toHaveLength(1);
  expect(facilitatorChartRows(fixture.accounts)[0]).toMatchObject({
    paid: '50000.00',
    fraction: 0.5,
  });
  expect(reconcileFacilitatorAccounts(fixture.accounts, summary)).toEqual([]);
});

function renderFees(accounts: FacilitatorAccount[], mismatch = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(facilitatorQueryOptions(1).queryKey, accounts);
  const summary = summaryFor(accounts);
  if (mismatch) summary.metrics.fees_paid.value = '0.01';
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(StatisticsFeesChart, { summary, refreshSummary: () => {} }),
    ),
  );
  client.clear();
  return html;
}

it('advierte discrepancias conservando datos y ofrece refrescar ambas fuentes', () => {
  const accounts = [account(1, '100.00', '50.00')];
  expect(renderFees(accounts)).not.toContain('No se pudo conciliar');
  const html = renderFees(accounts, true);
  expect(html).toContain('role="status"');
  expect(html).toContain('No se pudo conciliar');
  expect(html).toContain('Actualizar honorarios');
  expect(html).toContain('A pagar: $ 100,00');
  expect(html).toContain('Pagado: $ 50,00');
  expect(renderFees([])).toContain('Sin facilitadores en este período.');
});

it('una respuesta tardía no sustituye los facilitadores del período seleccionado', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveOld!: (response: Response) => void;
  const old = new Promise<Response>((resolve) => {
    resolveOld = resolve;
  });
  const next = feesFixture(2, 'single').accounts;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('period_id=1') ? old : Promise.resolve(Response.json(next)),
    ),
  );
  const observer = new QueryObserver(client, facilitatorQueryOptions(1));
  const stop = observer.subscribe(() => {});
  observer.setOptions(facilitatorQueryOptions(2));
  await client.fetchQuery(facilitatorQueryOptions(2));
  resolveOld(Response.json(feesFixture(1, null).accounts));
  await client.fetchQuery(facilitatorQueryOptions(1));
  expect(observer.getCurrentResult().data).toEqual(next);
  expect(observer.getCurrentResult().data?.[0].instructor).toContain('septiembre');
  stop();
  client.clear();
});
