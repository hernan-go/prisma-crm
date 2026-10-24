import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import request from 'supertest';
import { calculateSummary, type BalanceRow, type SummaryInput } from '../server/statistics/engine';
import {
  statisticsExpenseBreakdownSchema,
  statisticsMoney,
  statisticsSummarySchema,
} from '../shared/statistics';
import { facilitatorPending } from '../shared/facilitators';
import { balance } from '../shared/domain';
import { ExecutiveSummary, Statistics, statisticsKey } from '../client/Statistics';
import { PeriodContext } from '../client/App';
import { pool } from '../server/db';
import { statisticsExpenseBreakdown, statisticsSummary } from '../server/statistics/index';
import { inflationService, verifiedInflation } from '../server/statistics/inflation';
import { createApp } from '../server/app';
import { testCredentials, memorySessions } from './auth-helper';

const at = '2026-10-22T15:00:00.000Z';
const period = { id: 4, year: 2026, month: 10, status: 'open' as const };
const row = (
  due: string | null,
  paid = '0.00',
  id: number | null = 1,
  payments = 0,
): BalanceRow => ({ account_id: id, amount_due: due, paid, payment_count: payments });
const input = (overrides: Partial<SummaryInput> = {}): SummaryInput => ({
  period,
  members: [],
  fees: [],
  expenses: [],
  ...overrides,
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

it('distingue cero, NULL, sin cuenta y ausencia de registros', () => {
  const data = calculateSummary(
    input({ members: [row('0.00'), row(null), row(null, '0.00', null)] }),
    at,
  );
  expect(data.metrics.due).toMatchObject({
    value: '0.00',
    coverage: 'partial',
    universe: 3,
    defined: 1,
    undefined: 1,
    missing: 1,
  });
  expect(calculateSummary(input({ members: [row(null)] }), at).metrics.due.coverage).toBe(
    'undefined',
  );
  expect(calculateSummary(input(), at)).toMatchObject({
    empty: true,
    metrics: { due: { coverage: 'empty', value: '0.00' } },
  });
});
it('reconcilia deuda y crédito individual sin compensación, con pagos parciales', () => {
  const members = [
    row('100.10', '40.05', 1, 2),
    row('30.00', '50.00', 2, 1),
    row(null, '10.00', 3, 1),
  ];
  const { metrics: m } = calculateSummary(input({ members }), at);
  expect(m.due.value).toBe('130.10');
  expect(m.collected.value).toBe('100.05');
  expect(m.debt.value).toBe('60.05');
  expect(m.credit.value).toBe('20.00');
  expect(balance('100.10', '40.05')).toBe(m.debt.value);
  expect(m.collected).toMatchObject({ universe: 4, coverage: 'complete' });
  expect(m.debt.coverage).toBe('partial');
});
it('honorarios desconocidos y sobrepagos no generan créditos ni pendientes negativos', () => {
  const data = calculateSummary(
    input({
      fees: [
        row('80.00', '100.00', 1, 2),
        row('50.00', '10.00', 2, 1),
        row(null),
        row(null, '0.00', null),
      ],
    }),
    at,
  );
  expect(data.metrics.fees_committed.value).toBe('130.00');
  expect(data.metrics.fees_paid.value).toBe('110.00');
  expect(data.metrics.fees_pending.value).toBe(facilitatorPending('50.00', '10.00'));
  expect(data.fees_overpaid).toEqual({ count: 1, excess: '20.00' });
  expect(data.metrics.fees_pending.warnings).toHaveLength(2);
});
it('preserva precisión en agregados y formato argentino sin Number', () => {
  const data = calculateSummary(
    input({
      expenses: [
        { amount: '9999999999999999.99' },
        { amount: '0.01' },
        { amount: '0.10' },
        { amount: '0.20' },
      ],
    }),
    at,
  );
  expect(data.metrics.expenses.value).toBe('10000000000000000.30');
  expect(statisticsMoney(data.metrics.expenses.value)).toBe('$ 10.000.000.000.000.000,30');
  expect(statisticsMoney('0.00')).toBe('$ 0,00');
});
it('desglose tipado suma categorías con movimientos una sola vez por período', async () => {
  const db = {
    execute: vi
      .fn()
      .mockResolvedValueOnce([[period]])
      .mockResolvedValueOnce([
        [
          {
            category_id: 11,
            category_name: 'Expensas',
            recurring_concept_name: 'Expensas',
            amount: '270000.00',
            movement_count: 1,
          },
          {
            category_id: 12,
            category_name: 'Publicidad',
            recurring_concept_name: null,
            amount: '50000.00',
            movement_count: 1,
          },
          {
            category_id: 13,
            category_name: 'Insumos',
            recurring_concept_name: null,
            amount: '40000.00',
            movement_count: 2,
          },
        ],
      ]),
    query: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  vi.spyOn(pool, 'getConnection').mockResolvedValue(db as never);
  const result = await statisticsExpenseBreakdown(period.id);
  expect(statisticsExpenseBreakdownSchema.parse(result)).toEqual(result);
  expect(result.recurring).toMatchObject({ subtotal: '270000.00', movement_count: 1 });
  expect(result.additional).toMatchObject({ subtotal: '90000.00', movement_count: 3 });
  expect(result).toMatchObject({ total: '360000.00', movement_count: 4 });
  expect(String(db.execute.mock.calls[1][0])).toContain('JOIN period_expenses');
  expect(String(db.execute.mock.calls[1][0])).not.toContain('LEFT JOIN period_expenses');
  expect(db.commit).toHaveBeenCalledOnce();
  expect(db.release).toHaveBeenCalledOnce();
});
it('contrato JSON exige dinero exacto, período y estado IPC sin inventar índices', () => {
  const data = calculateSummary(input(), at);
  expect(statisticsSummarySchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
  expect(data.inflation).toMatchObject({
    value: null,
    status: 'pending_integration',
    reference_period: null,
  });
  expect(
    statisticsSummarySchema.safeParse({
      ...data,
      metrics: { ...data.metrics, due: { ...data.metrics.due, value: 0 } },
    }).success,
  ).toBe(false);
  expect(
    statisticsSummarySchema.safeParse({ ...data, period: { ...period, status: 'deleted' } })
      .success,
  ).toBe(false);
});

function mockConnection(fail = false, missingPeriod = false) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([missingPeriod ? [] : [period]])
    .mockResolvedValueOnce([[row('100.00', '30.00', 1, 1)]])
    .mockResolvedValueOnce([[row('20.00', '5.00', 2, 1)]])
    .mockResolvedValueOnce([[{ amount: '2.00' }]]);
  if (fail) execute.mockReset().mockRejectedValue(new Error('SQL unavailable'));
  const db = {
    execute,
    query: vi.fn().mockResolvedValue([]),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
  vi.spyOn(pool, 'getConnection').mockResolvedValue(db as never);
  return db;
}
it('lee un snapshot read-only y consultas parametrizadas sin filtros de fecha ni archivo', async () => {
  const db = mockConnection();
  const data = await statisticsSummary(4);
  expect(data.metrics.due.value).toBe('100.00');
  expect(db.query.mock.calls.map((c) => c[0])).toEqual([
    'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
    'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
  ]);
  for (const [sql, params] of db.execute.mock.calls) {
    expect(sql).toMatch(/^\s*SELECT/);
    expect(params.every((id: number) => id === 4)).toBe(true);
    expect(sql).not.toMatch(/FOR UPDATE|activo|advertising_investments|YEAR\(|MONTH\(/);
  }
  expect(db.execute.mock.calls[2][0]).toMatch(/UNION\s+SELECT/);
  expect(db.commit).toHaveBeenCalledOnce();
  expect(db.rollback).not.toHaveBeenCalled();
  expect(db.release).toHaveBeenCalledOnce();
});
it('libera la conexión y revierte ante error o período inexistente', async () => {
  let db = mockConnection(true);
  await expect(statisticsSummary(4)).rejects.toThrow('SQL unavailable');
  expect(db.rollback).toHaveBeenCalledOnce();
  expect(db.release).toHaveBeenCalledOnce();
  expect(db.commit).not.toHaveBeenCalled();
  db = mockConnection(false, true);
  await expect(statisticsSummary(4)).rejects.toMatchObject({ status: 404 });
  expect(db.execute).toHaveBeenCalledOnce();
  expect(db.release).toHaveBeenCalledOnce();
});
it('endpoint protegido, ID validado y respuesta agregada sin fichas personales', async () => {
  const credentials = await testCredentials();
  const app = createApp({ ...credentials, store: memorySessions() });
  const db = mockConnection();
  expect((await request(app).get('/api/statistics/summary?period_id=4')).status).toBe(401);
  expect((await request(app).get('/api/statistics/inflation')).status).toBe(401);
  expect(db.execute).not.toHaveBeenCalled();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
  await agent.get('/api/statistics/summary?period_id=bad').expect(422);
  expect(db.execute).not.toHaveBeenCalled();
  const response = await agent.get('/api/statistics/summary?period_id=4').expect(200);
  expect(statisticsSummarySchema.safeParse(response.body).success).toBe(true);
  expect(JSON.stringify(response.body)).not.toMatch(
    /nombre|apellido|telefono|person_id|account_id/,
  );
  vi.spyOn(inflationService, 'get').mockResolvedValue({
    status: 'verified',
    origin: 'live',
    snapshot: verifiedInflation,
  });
  const inflation = await agent.get('/api/statistics/inflation').expect(200);
  expect(inflation.body.snapshot.reference_period).toBe('2026-09');
});

function renderPage(
  options: { selected?: number; data?: ReturnType<typeof calculateSummary>; error?: boolean } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (options.data) client.setQueryData(statisticsKey(4), options.data);
  if (options.error)
    client
      .getQueryCache()
      .find({ queryKey: statisticsKey(4) })!
      .setState({ status: 'error', error: new Error('Consulta fallida') });
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        PeriodContext.Provider,
        { value: { period: options.selected ?? 4, periods: [period] } },
        createElement(Statistics),
      ),
    ),
  );
  client.clear();
  return html;
}
it('muestra carga, error, sin período y vacío sin convertir error en cero', () => {
  expect(renderPage()).toContain('Cargando');
  expect(renderPage({ selected: 0 })).toContain('Creá un período');
  const data = calculateSummary(input(), at);
  expect(renderPage({ data })).toContain('Este período no tiene');
  const error = renderPage({ data, error: true });
  expect(error).toContain('Consulta fallida');
  expect(error).not.toContain('Total registrado');
});
it('muestra límite de cobertura y controles de detalle sin bloques secundarios; oculta caché de otro período', () => {
  const data = calculateSummary(
    input({
      period: { ...period, status: 'closed' },
      members: [row('10.00', '20.00', 1, 1), row(null)],
    }),
    at,
  );
  const html = renderPage({ data });
  for (const label of [
    'Total parcial',
    'Información de Falta cobrar',
    'Información de Total a cobrar',
    'Información de Honorarios',
    '$ 10,00',
    'Información de Inflación',
    'Período cerrado',
    'octubre 2026',
  ])
    expect(html).toContain(label);
  expect(html).not.toContain('statistics-breakdown');
  expect(html).not.toContain('Créditos conocidos');
  expect(renderPage({ selected: 5, data })).not.toContain('$ 10,00');
  const renderClient = new QueryClient();
  const undefinedHtml = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: renderClient },
      createElement(ExecutiveSummary, {
        data: calculateSummary(input({ members: [row(null)] }), at),
      }),
    ),
  );
  renderClient.clear();
  expect(undefinedHtml).toContain('Sin definir');
});
it('respuestas tardías quedan en la clave de su período', async () => {
  const client = new QueryClient();
  let resolveOld!: (data: number) => void;
  const old = new Promise<number>((resolve) => {
    resolveOld = resolve;
  });
  const observer = new QueryObserver(client, { queryKey: statisticsKey(4), queryFn: () => old });
  const stop = observer.subscribe(() => {});
  observer.setOptions({ queryKey: statisticsKey(5), queryFn: async () => 5 });
  await client.fetchQuery({ queryKey: statisticsKey(5), queryFn: async () => 5 });
  resolveOld(4);
  await old;
  await Promise.resolve();
  expect(observer.getCurrentResult().data).toBe(5);
  stop();
  client.clear();
});
