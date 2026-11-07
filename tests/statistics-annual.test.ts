import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { calculateAnnual, type AnnualInput } from '../server/statistics/annual-engine';
import { calculateSummary } from '../server/statistics/engine';
import { statisticsAnnual } from '../server/statistics/annual';
import { statisticsAnnualSchema, type StatisticsPeriod } from '../shared/statistics';
import { pool } from '../server/db';
import { createApp } from '../server/app';
import request from 'supertest';
import { memorySessions, testCredentials } from './auth-helper';
import {
  annualChartRows,
  annualQueryOptions,
  statisticsAnnualKey,
} from '../client/statistics-annual';
import { QueryClient, QueryObserver, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StatisticsAnnualView from '../client/StatisticsAnnual';

const at = '2026-11-07T12:00:00.000Z';
const period = (
  id: number,
  year: number,
  month: number,
  status: 'open' | 'closed' = 'closed',
): StatisticsPeriod => ({ id, year, month, status });
const periods = [
  period(1, 2025, 11),
  period(2, 2025, 12),
  period(3, 2026, 1),
  period(4, 2026, 2, 'open'),
  period(6, 2026, 4),
];
function input(): AnnualInput {
  return {
    periods,
    members: [
      { period_id: 3, account_id: 1, amount_due: '100.10', paid: '40.05', payment_count: 1 },
      { period_id: 3, account_id: 2, amount_due: null, paid: '10.01', payment_count: 2 },
      { period_id: 3, account_id: null, amount_due: null, paid: '0.00', payment_count: 0 },
    ],
    enrollments: [
      { period_id: 1, person_id: 4 },
      { period_id: 2, person_id: 1 },
      { period_id: 2, person_id: 2 },
      { period_id: 3, person_id: 1 },
      { period_id: 3, person_id: 1 },
      { period_id: 3, person_id: 3 },
      { period_id: 3, person_id: 4 },
      { period_id: 4, person_id: 1 },
      { period_id: 6, person_id: 1 },
      { period_id: 6, person_id: 5 },
    ],
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => pool.end());

it('cada observación financiera reutiliza exactamente el motor mensual y su cobertura', () => {
  const source = input();
  const annual = calculateAnnual(2026, source, at);
  for (const month of annual.months.filter((m) => m.period)) {
    const monthly = calculateSummary(
      {
        period: month.period!,
        members: source.members.filter((m) => m.period_id === month.period!.id),
        fees: [],
        expenses: [],
      },
      at,
    );
    expect(month.due).toEqual(monthly.metrics.due);
    expect(month.collected).toEqual(monthly.metrics.collected);
  }
  expect(annual.months[0].due).toMatchObject({
    value: '100.10',
    coverage: 'partial',
    missing: 1,
    undefined: 1,
  });
  expect(annual.months[0].collected?.value).toBe('50.06');
  expect(JSON.stringify(annual)).not.toMatch(/person_id|account_id/);
});
it('deduplica personas, compara enero con diciembre y distingue nuevas/reincorporadas sin cambios de actividad', () => {
  const months = calculateAnnual(2026, input(), at).months;
  expect(months[0].participants).toBe(3);
  expect(months[0].continuity).toEqual({ base: 2, continued: 1, not_continued: 1 });
  expect(months[0].entries).toEqual({ new: 1, rejoined: 1, unclassified: 0 });
  expect(months[1].entries).toEqual({ new: 0, rejoined: 0, unclassified: 0 });
  expect(months[3].continuity).toBeNull();
  expect(months[3].continuity_reason).toBe('missing_previous');
  expect(months[3].entries).toEqual({ new: 1, rejoined: 0, unclassified: 1 });
});
it('el cobrado anual conserva sobrepagos y cobros de cuentas indefinidas sin confundirlo con obligación cubierta', () => {
  const source = input();
  source.members[0].paid = '150.11';
  const row = calculateAnnual(2026, source, at).months[0];
  expect(row.due?.value).toBe('100.10');
  expect(row.collected?.value).toBe('160.12');
});
it('diferencia períodos inexistentes, vacíos, abiertos, indefinidos y base anterior vacía', () => {
  const source = input();
  source.periods = [...source.periods, period(7, 2026, 5), period(8, 2026, 6)];
  source.enrollments.push({ period_id: 8, person_id: 1 });
  source.members.push({
    period_id: 4,
    account_id: 4,
    amount_due: null,
    paid: '9.99',
    payment_count: 1,
  });
  const data = calculateAnnual(2026, source, at);
  expect(data.months[1].period?.status).toBe('open');
  expect(data.months[1].due?.coverage).toBe('undefined');
  expect(annualChartRows(data)[1].duePlot).toBeNull();
  expect(data.months[2]).toMatchObject({ period: null, participants: null, due: null });
  expect(data.months[4]).toMatchObject({
    participants: 0,
    has_records: false,
    due: { value: '0.00', coverage: 'empty' },
  });
  expect(data.months[5].continuity_reason).toBe('empty_previous');
  expect(data.months[5].entries?.rejoined).toBe(1);
  expect(data.months[11].period).toBeNull();
});
it('años vacíos o con un solo mes no fabrican observaciones ni continuidad', () => {
  const empty = calculateAnnual(2027, { periods: [], members: [], enrollments: [] }, at);
  expect(
    empty.months.every((m) => m.due === null && m.participants === null && m.entries === null),
  ).toBe(true);
  expect(empty.history_start).toBeNull();
  const one = calculateAnnual(
    2026,
    { periods: [periods[2]], members: [], enrollments: [{ period_id: 3, person_id: 9 }] },
    at,
  );
  expect(one.months.filter((m) => m.period)).toHaveLength(1);
  expect(one.months[0].continuity).toBeNull();
  expect(one.months[0].entries?.new).toBe(1);
  expect(one.warnings.join(' ')).toContain('historial disponible');
});

function mockDb(fail = false) {
  const source = input();
  const db = {
    query: vi.fn().mockResolvedValue([]),
    execute: vi
      .fn()
      .mockResolvedValueOnce([source.periods])
      .mockResolvedValueOnce([source.members])
      .mockResolvedValueOnce([source.enrollments]),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  if (fail) db.execute.mockReset().mockRejectedValue(Error('Lectura fallida'));
  vi.spyOn(pool, 'getConnection').mockResolvedValue(db as never);
  return db;
}
it('usa tres lecturas parametrizadas en un snapshot read-only, sin N+1 ni joins de horarios/eventos', async () => {
  const db = mockDb();
  expect(statisticsAnnualSchema.safeParse(await statisticsAnnual('2026')).success).toBe(true);
  expect(db.query.mock.calls.map((c) => c[0])).toEqual([
    'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
    'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
  ]);
  expect(db.execute).toHaveBeenCalledTimes(3);
  for (const [sql, params] of db.execute.mock.calls as unknown as [string, number[]][]) {
    expect(sql).toMatch(/^\s*SELECT/);
    expect(sql).not.toMatch(
      /INSERT|UPDATE|DELETE|enrollment_slots|special_events|activities\.instructor_id/,
    );
    expect(params.every((value) => value === 2026)).toBe(true);
  }
  expect(db.commit).toHaveBeenCalledOnce();
  expect(db.release).toHaveBeenCalledOnce();
});
it('propaga el error, revierte y libera la conexión; valida año antes de adquirirla', async () => {
  const db = mockDb(true);
  await expect(statisticsAnnual('bad')).rejects.toThrow();
  expect(pool.getConnection).not.toHaveBeenCalled();
  await expect(statisticsAnnual(2026)).rejects.toThrow('Lectura fallida');
  expect(db.rollback).toHaveBeenCalledOnce();
  expect(db.commit).not.toHaveBeenCalled();
  expect(db.release).toHaveBeenCalledOnce();
});
it('endpoint administrativo exige autenticación y valida año sin escrituras ni exposición de personas', async () => {
  const credentials = await testCredentials();
  const app = createApp({ ...credentials, store: memorySessions() });
  const db = mockDb();
  await request(app).get('/api/statistics/annual?year=2026').expect(401);
  expect(db.execute).not.toHaveBeenCalled();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
  await agent.get('/api/statistics/annual?year=bad').expect(422);
  const response = await agent.get('/api/statistics/annual?year=2026').expect(200);
  expect(statisticsAnnualSchema.safeParse(response.body).success).toBe(true);
  expect(JSON.stringify(response.body)).not.toMatch(/person_id|account_id/);
});
it('la caché anual aísla respuestas tardías y no reemplaza el año actual', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const old = calculateAnnual(2025, input(), at),
    current = calculateAnnual(2026, input(), at);
  let release!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes('2025') ? delayed : Promise.resolve(Response.json(current)),
    ),
  );
  const observer = new QueryObserver(client, annualQueryOptions(2025));
  const unsubscribe = observer.subscribe(() => {});
  observer.setOptions(annualQueryOptions(2026));
  await client.fetchQuery(annualQueryOptions(2026));
  release(Response.json(old));
  await client.fetchQuery(annualQueryOptions(2025));
  expect(observer.getCurrentResult().data?.year).toBe(2026);
  expect(client.getQueryData(statisticsAnnualKey(2025))).toEqual(old);
  unsubscribe();
  client.clear();
});
it('frontend anual mantiene carga, error, cobertura y alternativa tabular sin KPI mensuales', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
  });
  const render = () =>
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client },
        createElement(StatisticsAnnualView, { year: 2026 }),
      ),
    );
  expect(render()).toContain('Cargando');
  client.setQueryData(statisticsAnnualKey(2026), calculateAnnual(2026, input(), at));
  expect(render()).toContain('$ 100,10');
  expect(render()).toContain('Subtotal parcial');
  expect(render()).toContain('Ver datos y cobertura');
  expect(render()).not.toContain('statistics-card');
  client
    .getQueryCache()
    .find({ queryKey: statisticsAnnualKey(2026) })!
    .setState({ status: 'error', error: Error('Consulta anual fallida') });
  expect(render()).toContain('Consulta anual fallida');
  expect(render()).toContain('$ 100,10');
  client.clear();
});
