import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  dailySchedules,
  dashboardDate,
  programmingTitle,
  type AgendaSchedule,
} from '../client/dashboard-model';
import { FinancialSummary, dashboardHelp } from '../client/Dashboard';
const schedule: AgendaSchedule = {
  id: 1,
  period_id: 4,
  activity: 'Yoga',
  active: 1,
  offered: 1,
  catalog_active: 1,
  day: 4,
  start: '10:00',
  end: '11:00',
  instructors: [{ id: 1, name: 'Facilitadora' }],
  people: [],
};
describe('Dashboard: fecha argentina independiente del dispositivo', () => {
  it('cambia el día y mes en medianoche argentina, incluido domingo', () => {
    expect(dashboardDate(new Date('2026-11-01T02:59:59Z'))).toMatchObject({
      year: 2026,
      month: 10,
      day: 6,
      weekday: 'sábado',
      time: '23:59',
    });
    expect(dashboardDate(new Date('2026-11-01T03:00:00Z'))).toMatchObject({
      year: 2026,
      month: 11,
      day: 0,
      weekday: 'domingo',
      time: '00:00',
    });
  });
  it('distingue período actual, histórico y futuro', () => {
    const now = new Date('2026-10-15T15:00:00Z');
    expect(programmingTitle({ year: 2026, month: 10 }, now)).toBe('Actividades de hoy');
    for (const month of [9, 11])
      expect(programmingTitle({ year: 2026, month }, now)).toBe('Programación de los jueves');
    expect(programmingTitle({ year: 2025, month: 11 }, new Date('2026-11-01T12:00:00Z'))).toBe(
      'Programación de los domingos',
    );
  });
});
describe('Dashboard: programación semanal por período', () => {
  it('incluye horarios habilitados sin inscriptos; excluye otros días/períodos y estados no vigentes', () => {
    const rows = [
      schedule,
      { ...schedule, id: 2, active: 0 },
      { ...schedule, id: 3, offered: 0 },
      { ...schedule, id: 4, catalog_active: 0 },
      { ...schedule, id: 5, day: 0 },
      { ...schedule, id: 6, period_id: 5 },
    ];
    expect(dailySchedules(rows, 4, 4).map((s) => s.id)).toEqual([1]);
    expect(dailySchedules(rows, 4, 1)).toEqual([]);
    expect(dailySchedules(rows, 0, 4)).toEqual([]);
  });
  it('conserva distintos horarios, orden estable y personas/facilitadores únicos', () => {
    const person = { person_id: 2, nombre: 'Nombre completo', apellido: 'Apellido completo' };
    const rows = [
      { ...schedule, id: 2, start: '09:00' },
      {
        ...schedule,
        people: [person, person],
        instructors: [...schedule.instructors, ...schedule.instructors],
      },
      { ...schedule, id: 3 },
    ];
    const result = dailySchedules(rows, 4, 4);
    expect(result.map((s) => s.id)).toEqual([2, 1, 3]);
    expect(result[1].people).toEqual([person]);
    expect(result[1].instructors).toHaveLength(1);
    expect(rows[1].people).toHaveLength(2);
  });
});
it('conserva métricas y desgloses financieros recibidos, sin recalcular personas ni inscripciones', () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(FinancialSummary, {
        data: {
          people: 35,
          enrollments: 60,
          due: '1127000.00',
          paid: '960000.00',
          pending: '167000.00',
          credit: '0.00',
          undefined_accounts: 2,
          wallets: {
            jesica: { cash: '505000.00', transfer: '0.00', total: '505000.00' },
            hernan: { cash: '50000.00', transfer: '405000.00', total: '455000.00' },
          },
          activities: [{ name: 'Yoga', count: 9 }],
        },
      }),
    ),
  );
  for (const label of [
    'Total inscriptos período',
    'Inscripciones en actividades',
    'Total a cobrar',
    'Total cobrado',
    'Carteras del mes',
    'Saldo a favor',
    '2 cuentas',
    '>35<',
    '>60<',
    '1.127.000',
    '960.000',
    '167.000',
    '505.000',
    '405.000',
    '455.000',
  ])
    expect(html).toContain(label);
  expect(html.indexOf('Carteras del mes')).toBeLessThan(html.indexOf('Saldos del mes'));
  expect(html.indexOf('Saldos del mes')).toBeLessThan(html.indexOf('Inscripciones por actividad'));
  expect(dashboardHelp[0]).toContain('tengan o no actividades');
  expect(dashboardHelp[1]).toContain('más de una vez');
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../client/Dashboard';
import { PeriodContext } from '../client/App';
const financeFixture = {
  people: 35,
  enrollments: 60,
  due: '1127000.00',
  paid: '960000.00',
  pending: '167000.00',
  credit: '0.00',
  undefined_accounts: 2,
  wallets: {
    jesica: { cash: '505000.00', transfer: '0.00', total: '505000.00' },
    hernan: { cash: '50000.00', transfer: '405000.00', total: '455000.00' },
  },
  activities: [],
};
function renderDashboard(
  options: {
    period?: number;
    financeError?: boolean;
    agendaError?: boolean;
    loading?: boolean;
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const period = options.period ?? 4;
  if (!options.loading) {
    client.setQueryData(['dashboard', period], financeFixture);
    client.setQueryData(
      ['agenda', period],
      [
        {
          ...schedule,
          day: dashboardDate(new Date()).day,
          people: [{ person_id: 7, nombre: 'Persona', apellido: 'Completa' }],
        },
      ],
    );
    if (options.financeError)
      client
        .getQueryCache()
        .find({ queryKey: ['dashboard', period] })!
        .setState({ status: 'error', error: new Error('Error de finanzas') });
    if (options.agendaError)
      client
        .getQueryCache()
        .find({ queryKey: ['agenda', period] })!
        .setState({ status: 'error', error: new Error('Error de agenda') });
  }
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          PeriodContext.Provider,
          { value: { period, periods: [{ id: period, year: 2020, month: 9, status: 'closed' }] } },
          createElement(Dashboard),
        ),
      ),
    ),
  );
  client.clear();
  return html;
}
it('renderiza agenda aunque fallen las finanzas y viceversa', () => {
  expect(renderDashboard({ financeError: true })).toContain('Persona Completa');
  expect(renderDashboard({ financeError: true })).toContain('Error de finanzas');
  expect(renderDashboard({ agendaError: true })).toContain('Total cobrado');
  expect(renderDashboard({ agendaError: true })).toContain('Error de agenda');
});
it('expone carga y ausencia de período sin usar datos de otro mes', () => {
  expect(renderDashboard({ loading: true })).toContain('Cargando');
  const empty = renderDashboard({ period: 0 });
  expect(empty).toContain('Creá un período');
  expect(empty).toContain('Clima no disponible');
  expect(empty).not.toContain('Total cobrado');
});
it('mantiene nombres visibles y enlace existente sin controles de despliegue en período cerrado', () => {
  const html = renderDashboard();
  expect(html).toContain('Persona Completa');
  expect(html).toContain('href="/personas/7"');
  expect(html).toContain('class="dashboard-people"');
  expect(html).not.toContain('Ver personas inscriptas');
  expect(html).not.toContain('dashboard-people-toggle');
  expect(html).not.toContain('Programación semanal e inscripciones.');
  expect(html).toContain('dashboard-day-tile');
  expect(html).toContain('dashboard-clock');
  expect(html).toContain('Programación de los');
  expect(html).not.toContain('Asistentes');
});

import { QueryObserver } from '@tanstack/react-query';
it('aísla respuestas tardías al cambiar rápidamente de período', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveOld!: (value: typeof financeFixture) => void;
  const old = new Promise<typeof financeFixture>((resolve) => {
    resolveOld = resolve;
  });
  const observer = new QueryObserver(client, { queryKey: ['dashboard', 4], queryFn: () => old });
  const stop = observer.subscribe(() => {});
  observer.setOptions({
    queryKey: ['dashboard', 5],
    queryFn: async () => ({ ...financeFixture, people: 12 }),
  });
  await client.fetchQuery({
    queryKey: ['dashboard', 5],
    queryFn: async () => ({ ...financeFixture, people: 12 }),
  });
  resolveOld(financeFixture);
  await old;
  await Promise.resolve();
  expect(observer.getCurrentResult().data?.people).toBe(12);
  expect(observer.getCurrentResult().data?.enrollments).toBe(60);
  stop();
  client.clear();
});
