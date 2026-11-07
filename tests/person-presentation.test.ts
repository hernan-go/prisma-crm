import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { comparePeople, personName } from '../client/person-presentation';
import { People, PersonDetail, PersonPicker, peopleQueryOptions } from '../client/People';
import { Monthly, Agenda, Payments } from '../client/Management';
import { PeriodPersonPicker } from '../client/PeriodPersonPicker';
import { PeriodContext } from '../client/App';
import { dailySchedules } from '../client/dashboard-model';

const rows = [
  { id: 1, nombre: 'Ana', apellido: 'Zulu' },
  { id: 2, nombre: 'Zoe', apellido: 'Álvarez' },
  { id: 3, nombre: 'ana', apellido: 'alvarez' },
  { id: 4, nombre: 'Luz', apellido: 'De la Cruz' },
].map((p) => ({
  ...p,
  person_id: p.id,
  membership_id: p.id,
  activo: 1,
  public_id: `P-${p.id}`,
  telefono: '',
}));
const expected = ['alvarez, ana', 'Álvarez, Zoe', 'De la Cruz, Luz', 'Zulu, Ana'];
const clients: QueryClient[] = [];
function client() {
  const q = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(q);
  return q;
}
function render(Component: ComponentType, q: QueryClient) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: q },
      createElement(
        MemoryRouter,
        { initialEntries: ['/personas/1'] },
        createElement(
          PeriodContext.Provider,
          { value: { period: 1, periods: [{ id: 1, year: 2026, month: 11, status: 'open' }] } },
          createElement(
            Routes,
            {},
            createElement(Route, { path: '/personas/:id', element: createElement(Component) }),
          ),
        ),
      ),
    ),
  );
}
function ordered(html: string) {
  expected.forEach((name, index) => {
    expect(html).toContain(name);
    if (index) expect(html.indexOf(expected[index - 1])).toBeLessThan(html.indexOf(name));
  });
}
afterEach(() => clients.splice(0).forEach((q) => q.clear()));

it('compara en español por apellido y nombre, ignorando tildes y mayúsculas y respetando ñ', () => {
  expect([...rows].sort(comparePeople).map(personName)).toEqual(expected);
  expect(
    comparePeople({ apellido: 'ÁLVAREZ', nombre: 'ANA' }, { apellido: 'alvarez', nombre: 'ana' }),
  ).toBe(0);
  expect(
    ['Ñúñez', 'Núñez', 'Ocampo']
      .map((apellido) => ({ apellido, nombre: 'Ana' }))
      .sort(comparePeople)
      .map((p) => p.apellido),
  ).toEqual(['Núñez', 'Ñúñez', 'Ocampo']);
  expect(personName({ apellido: 'De la Cruz', nombre: 'María José' })).toBe(
    'De la Cruz, María José',
  );
});
it('Personas conserva paginación, enlaces y parámetros de búsqueda con formato y orden uniformes', () => {
  const q = client();
  const response = { rows: structuredClone(rows), total: 80 };
  q.setQueryData(peopleQueryOptions('', 1, false).queryKey, response);
  const html = render(People, q);
  ordered(html);
  expect(html).toContain('80 personas');
  expect(html).toContain('>Siguiente</button>');
  rows.forEach((p) => expect(html).toContain(`href="/personas/${p.id}"`));
  expect(response.rows).toEqual(rows);
  expect(peopleQueryOptions('Álvarez', 2, true).queryKey).toEqual(['people', 'Álvarez', 2, true]);
});
it.each([
  PersonPicker,
  () => createElement(PeriodPersonPicker, { excluded: [2], onSelect: () => {} }),
])('buscadores ordenan las coincidencias sin alterar identidades ni exclusiones', (Picker) => {
  const q = client();
  q.setQueryData(['pick-person', ''], { rows });
  const Component = () => createElement(Picker, { onSelect: () => {} });
  const html = render(Component, q);
  ordered(html);
  expect(q.getQueryData(['pick-person', ''])).toEqual({ rows });
});
it('Inscriptos Período presenta apellido y nombre en orden alfabético', () => {
  const q = client();
  q.setQueryData(['memberships', '/periods/1/memberships'], rows);
  ordered(render(Monthly, q));
});
it('Agenda y Dashboard ordenan asistentes sin cambiar actividades, facilitadores ni datos', () => {
  const q = client();
  const agenda = [
    {
      id: 1,
      activity_id: 1,
      period_id: 1,
      activity: 'Taller',
      active: 1,
      offered: 1,
      catalog_active: 1,
      day: 1,
      start: '10:00',
      end: '11:00',
      instructors: [{ id: 8, name: 'Facilitador' }],
      people: structuredClone(rows),
    },
  ];
  const before = structuredClone(agenda);
  q.setQueryData(['agenda', '/agenda?period_id=1'], agenda);
  ordered(render(Agenda, q));
  expect(dailySchedules(agenda, 1, 1)[0].people.map(personName)).toEqual(expected);
  expect(agenda).toEqual(before);
});
it('Cobros ordena cuentas y formatea nombres conservando secuencia e importes de movimientos', () => {
  const q = client();
  q.setQueryData(
    ['accounts', '/accounts?period_id=1'],
    rows.map((p) => ({ ...p, amount_due: '100', paid: '20', balance: '80' })),
  );
  const payments = [rows[0], rows[3], rows[2]].map((p, i) => ({
    ...p,
    id: i + 10,
    amount: '20',
    date: '2026-11-07',
    recipient: 'jesica',
    method: 'cash',
    notes: `Movimiento ${i}`,
  }));
  const before = structuredClone(payments);
  q.setQueryData(['payments', '/payments?period_id=1'], payments);
  const html = render(Payments, q);
  ordered(html.split('<h2>Movimientos</h2>')[0]);
  const movements = html.split('<h2>Movimientos</h2>')[1];
  expect(movements.indexOf('Zulu, Ana')).toBeLessThan(movements.indexOf('De la Cruz, Luz'));
  expect(movements.indexOf('De la Cruz, Luz')).toBeLessThan(movements.indexOf('alvarez, ana'));
  expect(payments).toEqual(before);
});
it('ficha individual conserva identidad y encabezado Apellido, Nombre', () => {
  const q = client();
  q.setQueryData(['person', '1'], { ...rows[0], history: [], payments: [], accounts: [] });
  const html = render(PersonDetail, q);
  expect(html).toContain('<h1 class="participant-name">Zulu, Ana</h1>');
  expect(html).toContain('href="/personas"');
});
