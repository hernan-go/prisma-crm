// Synthetic UI fixture. Every request stays in memory; no database or real identity is used.
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from '../../client/Auth';
import App from '../../client/App';
import '../../client/styles.css';

let authenticated = true;
const period = { id: 1, year: 2026, month: 11, status: 'open' };
const wallets = {
  jesica: { cash: '20000', transfer: '15000', total: '35000' },
  hernan: { cash: '12000', transfer: '18000', total: '30000' },
};
const people = [
  {
    id: 1,
    public_id: 'QA-001',
    nombre: 'Persona',
    apellido: 'Ejemplo',
    telefono: '',
    email: '',
    activo: 1,
  },
];

window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  const path = url.pathname.replace(/^\/api/, '');
  if (path === '/auth/session')
    return Response.json({
      authenticated,
      configured: true,
      method: authenticated ? 'identity' : null,
      identity: authenticated
        ? { userId: 'qa', displayName: 'Usuario QA', roles: ['admin'] }
        : null,
      legacy: { available: false },
    });
  if (path === '/auth/logout' && init?.method === 'POST') {
    authenticated = false;
    return Response.json({ ok: true });
  }
  if (init?.method && init.method !== 'GET') throw Error('QA: escritura bloqueada');
  if (path === '/periods') return Response.json([period]);
  if (path === '/dashboard')
    return Response.json({
      people: 1,
      enrollments: 1,
      due: '75000',
      paid: '65000',
      pending: '10000',
      credit: '0',
      undefined_accounts: 0,
      wallets,
      events: [],
      activities: [],
      income_sources: { total: '65000' },
    });
  if (path === '/agenda')
    return Response.json([
      {
        id: 1,
        period_id: 1,
        activity: 'Taller de prueba',
        active: 1,
        offered: 1,
        catalog_active: 1,
        day: 5,
        start: '10:00',
        end: '11:00',
        instructors: [{ id: 1, name: 'Facilitador de prueba' }],
        people: [{ person_id: 1, nombre: 'Persona', apellido: 'Ejemplo' }],
      },
    ]);
  if (path === '/weather') return Response.json({ weather: null });
  if (path === '/people') return Response.json({ rows: people, total: people.length });
  throw Error(`QA: solicitud inesperada ${path}`);
};

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BrowserRouter>
      <AuthGate>
        <App />
      </AuthGate>
    </BrowserRouter>
  </QueryClientProvider>,
);
