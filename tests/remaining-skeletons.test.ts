import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { PeriodContext } from '../client/App';
import { Agenda, Monthly, Payments, PersonMonth } from '../client/Management';
import { FacilitatorPayments } from '../client/FacilitatorPayments';
import { Expenses } from '../client/Expenses';
import { Dashboard } from '../client/Dashboard';
import { PeriodPersonPicker } from '../client/PeriodPersonPicker';

const clients: QueryClient[] = [];
const period = { id: 1, year: 2026, month: 10, status: 'open' };
function client() {
  const q = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
  });
  clients.push(q);
  return q;
}
function render(Component: React.ComponentType, q: QueryClient, id = 1) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: q },
      createElement(
        MemoryRouter,
        {},
        createElement(
          PeriodContext.Provider,
          { value: { period: id, periods: [period] } },
          createElement(Component),
        ),
      ),
    ),
  );
}
afterEach(() => clients.splice(0).forEach((q) => q.clear()));
it('Buscador de Inscritos: carga, exclusiones y vacío confirmado mantienen la consulta existente', () => {
  const q = client();
  const Picker = () => createElement(PeriodPersonPicker, { excluded: [1], onSelect: () => {} });
  expect(render(Picker, q)).toContain('Buscando personas');
  expect(render(Picker, q)).not.toContain('No hay coincidencias');
  q.setQueryData(['pick-person', ''], { rows: [{ id: 1, nombre: 'Ana', apellido: 'Sintética' }] });
  expect(render(Picker, q)).toContain('Ya incorporada');
  expect(render(Picker, q)).not.toContain('Buscando personas');
  q.setQueryData(['pick-person', ''], { rows: [] });
  expect(render(Picker, q)).toContain('No hay coincidencias');
});
it.each([
  ['Cobros', Payments, 'Sin cuentas en este período.'],
  ['Inscritos', Monthly, 'No hay personas inscriptas en este período.'],
  ['Facilitadores', FacilitatorPayments, 'Sin facilitadores'],
  ['Gastos', Expenses, 'No hay categorías'],
  ['Agenda', Agenda, 'Sin horarios'],
  ['Dashboard', Dashboard, 'No hay horarios habilitados'],
] as const)(
  '%s: un error inicial ofrece recuperación sin simular vacío ni mantener Skeletons',
  (_name, Component, emptyMessage) => {
    const q = client();
    render(Component, q);
    q.getQueryCache()
      .getAll()
      .forEach((query) =>
        query.setState({
          status: 'error',
          fetchStatus: 'idle',
          error: new Error('Error controlado'),
        }),
      );
    const html = render(Component, q);
    expect(html).toContain('Error controlado');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain(emptyMessage);
    expect(html).not.toContain('react-loading-skeleton');
  },
);
it('Inscritos: importe desconocido y cero real se distinguen después de resolver la cuenta', () => {
  const q = client();
  const Member = () => createElement(PersonMonth, { person: { id: 1, activo: 1 } });
  q.setQueryData(['memberships', '/periods/1/memberships?person_id=1'], [{}]);
  q.setQueryData(
    ['accounts', '/accounts?period_id=1&person_id=1'],
    [{ amount_due: null, paid: '0', balance: null }],
  );
  expect(render(Member, q)).toContain('Importe a cobrar no definido');
  q.setQueryData(
    ['accounts', '/accounts?period_id=1&person_id=1'],
    [{ amount_due: '0', paid: '0', balance: '0' }],
  );
  expect(render(Member, q)).not.toContain('Importe a cobrar no definido');
});
it('Dashboard: fecha visible, regiones independientes y datos conservados tras error de actualización', () => {
  const q = client();
  let html = render(Dashboard, q);
  expect(html).toContain('<time');
  expect(html).toContain('Cargando programación');
  expect(html).toContain('Cargando resumen financiero');
  q.setQueryData(['agenda', 1], []);
  html = render(Dashboard, q);
  expect(html).toContain('No hay horarios habilitados');
  expect(html).toContain('Cargando resumen financiero');
  q.setQueryData(['dashboard', 1], {
    people: 7,
    enrollments: 9,
    due: '200',
    paid: '100',
    pending: '100',
    credit: '0',
    undefined_accounts: 0,
    activities: [],
    wallets: {
      jesica: { cash: '0', transfer: '100', total: '100' },
      hernan: { cash: '0', transfer: '0', total: '0' },
    },
  });
  q.getQueryCache()
    .find({ queryKey: ['dashboard', 1] })!
    .setState({
      status: 'error',
      error: new Error('Resumen temporalmente no disponible'),
      fetchStatus: 'idle',
    });
  html = render(Dashboard, q);
  expect(html).toContain('Resumen temporalmente no disponible');
  expect(html).toContain('Carteras del mes');
  expect(html).toContain('Reintentar resumen');
  expect(html).not.toContain('Cargando resumen');
  expect(render(Dashboard, q, 2)).not.toContain('Carteras del mes');
});
it('Agenda: no anuncia horarios vacíos mientras carga y no simula carga sin período', () => {
  const q = client();
  expect(render(Agenda, q)).toContain('Cargando horarios y participantes');
  expect(render(Agenda, q)).not.toContain('Sin horarios');
  q.setQueryData(['agenda', '/agenda?period_id=1'], []);
  expect(render(Agenda, q)).toContain('Sin horarios');
  expect(render(Agenda, q, 2)).toContain('Cargando horarios');
  expect(render(Agenda, q, 0)).not.toContain('Cargando');
});
it('Gastos: recurrentes y adicionales resuelven sin confundir categorías pendientes con vacío', () => {
  const q = client();
  const html = render(Expenses, q);
  expect(html).toContain('Cargando gastos recurrentes');
  expect(html).toContain('Cargando categorías y gastos adicionales');
  expect(html).not.toContain('No hay categorías');
  q.setQueryData(['recurring-expenses', 1], { tiles: [], revision: 'test' });
  expect(render(Expenses, q)).toContain('Agregá conceptos');
  expect(render(Expenses, q)).toContain('Cargando categorías');
  q.setQueryData(['expense-categories', 1], []);
  expect(render(Expenses, q)).toContain('No hay categorías');
  expect(render(Expenses, q, 0)).not.toContain('Cargando');
});
it('Facilitadores: carga de bloques, vacío y consulta deshabilitada son distintos', () => {
  const q = client();
  expect(render(FacilitatorPayments, q)).toContain('Cargando facilitadores y honorarios');
  expect(render(FacilitatorPayments, q)).not.toContain('Sin facilitadores');
  expect(render(FacilitatorPayments, q, 0)).not.toContain('Cargando');
  q.setQueryData(['facilitator-accounts', 1], []);
  expect(render(FacilitatorPayments, q)).toContain('Sin facilitadores');
  q.setQueryData(
    ['facilitator-accounts', 1],
    [
      {
        id: 7,
        offering_id: 1,
        instructor_id: 1,
        instructor: 'Facilitadora',
        activity: 'Yoga',
        assigned: 1,
        amount_due: '50',
        paid: '0',
        pending: '50',
      },
    ],
  );
  const html = render(FacilitatorPayments, q);
  expect(html).toContain('Yoga');
  expect(html).not.toContain('Cargando movimientos');
  expect(q.getQueryCache().find({ queryKey: ['facilitator-payments', 7] })?.state.fetchStatus).toBe(
    'idle',
  );
});
it('Cobros: cuentas y movimientos resuelven por separado sin vacíos prematuros', () => {
  const q = client();
  const first = render(Payments, q);
  expect(first).toContain('Cargando cuentas');
  expect(first).toContain('Cargando movimientos');
  expect(first).not.toContain('Sin cuentas');
  expect(first).not.toContain('Sin pagos');
  q.setQueryData(['accounts', '/accounts?period_id=1'], []);
  const next = render(Payments, q);
  expect(next).toContain('Sin cuentas');
  expect(next).toContain('Cargando movimientos');
  q.setQueryData(['payments', '/payments?period_id=1'], []);
  expect(render(Payments, q)).toContain('Sin pagos');
  expect(render(Payments, q, 2)).not.toContain('Sin cuentas');
  expect(render(Payments, q, 0)).not.toContain('Cargando');
});
it('Inscritos: lista y gestión individual no muestran dinero o ausencia de pagos antes de recibir datos', () => {
  const q = client();
  expect(render(Monthly, q)).toContain('Cargando personas inscriptas');
  const person = { id: 1, nombre: 'Ana', activo: 1 };
  const Member = () => createElement(PersonMonth, { person });
  q.setQueryData(['memberships', '/periods/1/memberships?person_id=1'], [{ id: 1 }]);
  let html = render(Member, q);
  expect(html).toContain('Cargando inscripciones');
  expect(html).toContain('Cargando cuenta del mes');
  expect(html).toContain('Cargando pagos de la persona');
  expect(html).not.toContain('Importe a cobrar no definido');
  expect(html).not.toContain('No hay pagos registrados');
  q.setQueryData(
    ['accounts', '/accounts?period_id=1&person_id=1'],
    [{ amount_due: '0', paid: '0', balance: '0' }],
  );
  html = render(Member, q);
  expect(html).not.toContain('Cargando cuenta del mes');
  expect(html).toContain('Cargando pagos de la persona');
  expect(html).not.toContain('Importe a cobrar no definido');
  q.setQueryData(['payments', '/payments?period_id=1'], []);
  expect(render(Member, q)).toContain('No hay pagos registrados');
});
