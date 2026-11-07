import { createElement, isValidElement, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Payments } from '../client/Management';

const context = vi.hoisted(() => ({ period: 1, status: 'open' }));
const queries = vi.hoisted(() => ({ accounts: {} as any, payments: {} as any }));
vi.mock('../client/App', async (original) => ({
  ...(await original<object>()),
  usePeriod: () => ({
    period: context.period,
    periods: [{ id: context.period, status: context.status }],
  }),
}));
vi.mock('react', async (original) => ({
  ...(await original<object>()),
  useState: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<object>()),
  useQuery: ({ queryKey }: any) => queries[queryKey[0] as keyof typeof queries],
}));

const accounts = [
  {
    id: 1,
    person_id: 1,
    nombre: 'Zoe',
    apellido: 'Zulu',
    amount_due: '100',
    paid: '20',
    balance: '80',
  },
  {
    id: 2,
    person_id: 2,
    nombre: 'Ana',
    apellido: 'Álvarez',
    amount_due: '10',
    paid: '10',
    balance: '0',
  },
  {
    id: 3,
    person_id: 3,
    nombre: 'Beto',
    apellido: 'Bravo',
    amount_due: '10',
    paid: '20',
    balance: '-10',
  },
  {
    id: 4,
    person_id: 4,
    nombre: 'Carla',
    apellido: 'Cruz',
    amount_due: null,
    paid: '0',
    balance: null,
  },
  { id: 5, person_id: 5, nombre: 'Dani', apellido: 'Díaz', paid: '0' },
  {
    id: 6,
    person_id: 6,
    nombre: 'Ana',
    apellido: 'Zulu',
    amount_due: '1',
    paid: '0',
    balance: 0.01,
  },
];
const movement = {
  id: 9,
  person_id: 2,
  nombre: 'Ana',
  apellido: 'Álvarez',
  amount: '10',
  date: '2026-11-07',
  recipient: 'jesica',
  method: 'cash',
  notes: 'Pago conservado',
};
let state: unknown[];
let tree: ReactNode;
let key: string | null | undefined;
const clients: QueryClient[] = [];

// Evaluate the component with controlled local hooks, then render its real UI.
// Period reset is checked through the existing React key and fresh initial state.
function render() {
  const element = Payments();
  if (element.key !== key) {
    state = [];
    key = element.key;
  }
  let index = 0;
  vi.mocked(useState).mockImplementation(((initial: unknown) => {
    const slot = index++;
    if (!(slot in state)) state[slot] = initial;
    return [
      state[slot],
      (value: unknown) => {
        state[slot] = value;
      },
    ];
  }) as typeof useState);
  tree = element.type(element.props);
  vi.mocked(useState).mockImplementation(realUseState);
  const client = new QueryClient();
  clients.push(client);
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(MemoryRouter, {}, tree)),
  );
}
const { useState: realUseState } = await vi.importActual<typeof import('react')>('react');
function find(node: ReactNode, predicate: (element: any) => boolean): any {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return predicate(node) ? node : find(node.props.children, predicate);
}
function toggle(checked: boolean) {
  find(tree, (e) => e.type === 'input' && e.props.type === 'checkbox').props.onChange({
    target: { checked },
  });
  return render();
}
function accountIds(html: string) {
  const table = html.split('<tbody>')[1].split('</tbody>')[0];
  return [...table.matchAll(/href="\/personas\/(\d+)"/g)].map((match) => Number(match[1]));
}
beforeEach(() => {
  context.period = 1;
  context.status = 'open';
  state = [];
  key = undefined;
  queries.accounts = { data: structuredClone(accounts), isSuccess: true };
  queries.payments = { data: [movement], isSuccess: true };
});
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

it('inicia desactivado con todas las cuentas en orden español y permite desactivar nuevamente', () => {
  const html = render();
  expect(html).toContain('Solo deudores');
  expect(html).not.toContain('checked=""');
  expect(accountIds(html)).toEqual([2, 3, 4, 5, 6, 1]);
  expect(accountIds(toggle(true))).toEqual([6, 1]);
  expect(accountIds(toggle(false))).toEqual([2, 3, 4, 5, 6, 1]);
});
it('integración: Solo deudores conserva Apellido, Nombre y el desempate alfabético por nombre', () => {
  render();
  const html = toggle(true);
  const table = html.split('<tbody>')[1].split('</tbody>')[0];
  expect(accountIds(html)).toEqual([6, 1]);
  expect(table).toContain('Zulu, Ana');
  expect(table).toContain('Zulu, Zoe');
  expect(table.indexOf('Zulu, Ana')).toBeLessThan(table.indexOf('Zulu, Zoe'));
  expect(table).not.toContain('Álvarez, Ana');
});
it.each([
  ['indefinido', undefined],
  ['nulo', null],
  ['cero', 0],
  ['cero decimal', '0.00'],
  ['negativo', '-0.01'],
])('excluye saldo %s de los deudores', (_label, balance) => {
  queries.accounts.data = [{ ...accounts[0], balance }];
  render();
  const html = toggle(true);
  expect(accountIds(html)).toEqual([]);
  expect(html).toContain('No hay deudores en este período.');
});
it('conserva el vacío original, la carga y el error sin anunciar ausencia de deudores', () => {
  queries.accounts = { isPending: true };
  render();
  let html = toggle(true);
  expect(html).toContain('Cargando cuentas');
  expect(html).not.toContain('No hay deudores');
  queries.accounts = { isError: true, error: new Error('Error controlado'), refetch: vi.fn() };
  html = render();
  expect(html).toContain('Error controlado');
  expect(html).not.toContain('No hay deudores');
  queries.accounts = { data: [], isSuccess: true };
  html = render();
  expect(html).toContain('Sin cuentas en este período.');
  expect(html).not.toContain('No hay deudores');
});
it('cambia la key por período y vuelve al estado desactivado, incluso al regresar', () => {
  render();
  toggle(true);
  const firstKey = key;
  context.period = 2;
  let html = render();
  expect(key).not.toBe(firstKey);
  expect(html).not.toContain('checked=""');
  expect(accountIds(html)).toHaveLength(6);
  toggle(true);
  context.period = 1;
  html = render();
  expect(html).not.toContain('checked=""');
  expect(accountIds(html)).toHaveLength(6);
});
it('filtra solo cuentas: conserva datos, importes y movimientos con sus acciones', () => {
  const before = structuredClone(queries);
  const html = render();
  const filtered = toggle(true);
  expect(filtered.split('<h2>Movimientos</h2>')[1]).toBe(html.split('<h2>Movimientos</h2>')[1]);
  expect(filtered).toContain('Pago conservado');
  expect(filtered).toContain('Editar');
  expect(filtered).toContain('Registrar pago');
  expect(queries).toEqual(before);
  // Existing edit operation still selects the unfiltered movement.
  find(tree, (e) => e.type === 'button' && e.props.children === 'Editar').props.onClick();
  expect(state).toContainEqual(movement);
  const remove = find(tree, (e) => e.props.path === '/payments/9?period_id=1');
  expect(remove.props.disabled).toBe(false);
});
it('conserva el bloqueo de operaciones en períodos cerrados al filtrar', () => {
  context.status = 'closed';
  render();
  toggle(true);
  expect(
    find(tree, (e) => e.type === 'button' && e.props.children === 'Editar').props.disabled,
  ).toBe(true);
  expect(find(tree, (e) => e.props.path === '/payments/9?period_id=1').props.disabled).toBe(true);
});
