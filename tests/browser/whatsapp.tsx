// Synthetic administrative UI only. No backend or WhatsApp navigation is allowed.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../client/App';
import '../../client/styles.css';
const params = new URLSearchParams(location.search);
const people = [
  {
    id: 1,
    membership_id: 1,
    nombre: 'Ana',
    apellido: 'Prueba',
    public_id: 'P-0001',
    telefono: '3410000000',
    activo: 1,
    activities: 'Actividad sintética',
  },
  {
    id: 2,
    membership_id: 2,
    nombre: 'Persona',
    apellido: 'Sin teléfono',
    public_id: 'P-0002',
    telefono: '',
    activo: 1,
  },
  {
    id: 3,
    membership_id: 3,
    nombre: 'Persona',
    apellido: 'Ambigua',
    public_id: 'P-0003',
    telefono: '15 0000000',
    activo: 1,
  },
];
window.fetch = async (input, init) => {
  if (init?.method && init.method !== 'GET') throw Error('QA: escritura bloqueada');
  const path = new URL(String(input), location.href).pathname.replace(/^\/api/, '');
  if (path === '/periods') return Response.json([{ id: 1, year: 2026, month: 11, status: 'open' }]);
  if (path === '/people') return Response.json({ rows: people, total: people.length });
  if (path === '/periods/1/memberships')
    return params.has('error')
      ? Response.json({ message: 'Fallo sintético' }, { status: 503 })
      : Response.json(people);
  if (path === '/accounts')
    return Response.json(
      people.map((p) => ({
        id: p.id,
        person_id: p.id,
        nombre: p.nombre,
        apellido: p.apellido,
        amount_due: '100',
        paid: '0',
        balance: '100',
      })),
    );
  if (['/payments', '/activities', '/instructors', '/offerings', '/enrollments'].includes(path))
    return Response.json([]);
  throw Error(`QA: consulta bloqueada ${path}`);
};
document.addEventListener(
  'click',
  (event) => {
    if ((event.target as Element).closest('a[href^="https://wa.me/"]')) event.preventDefault();
  },
  true,
);
const route =
  params.get('view') === 'payments'
    ? '/pagos'
    : params.get('view') === 'monthly'
      ? '/gestion'
      : '/personas';
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30000, refetchOnWindowFocus: false } },
});
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
