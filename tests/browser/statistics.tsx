// Local visual fixture: no backend, credentials or business data.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '../../client/App';
import { calculateSummary } from '../../server/statistics/engine';
import '../../client/styles.css';

const periods = [
  { id: 1, year: 2026, month: 10, status: 'open' as const },
  { id: 2, year: 2026, month: 9, status: 'closed' as const },
];
window.fetch = async (input, init) => {
  if (init?.method && init.method !== 'GET') throw Error('QA: writes blocked');
  const url = new URL(String(input), location.href);
  if (url.pathname === '/api/periods') return Response.json(periods);
  if (url.pathname === '/api/statistics/inflation')
    return Response.json({
      status: 'verified',
      origin: 'live',
      snapshot: {
        reference_period: '2026-09',
        monthly: '1.9',
        year_to_date: '23.6',
        year_over_year: '33.4',
        published_at: '2026-10-13',
        verified_at: '2026-10-22',
        source: 'INDEC · IPC nacional, nivel general',
        source_url: 'https://www.indec.gob.ar/uploads/informesdeprensa/ipc_10_268C45A9444C.pdf',
        series_url: 'https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv',
      },
    });
  if (url.pathname === '/api/statistics/summary') {
    const period = periods.find((p) => p.id === Number(url.searchParams.get('period_id')))!;
    return Response.json(
      calculateSummary(
        {
          period,
          members: [
            { account_id: 1, amount_due: '1234567.89', paid: '900000.00', payment_count: 12 },
            { account_id: 2, amount_due: '100.00', paid: '150.00', payment_count: 1 },
            { account_id: null, amount_due: null, paid: '0.00', payment_count: 0 },
          ],
          fees: [
            { account_id: 1, amount_due: '150000.00', paid: '160000.00', payment_count: 2 },
            { account_id: 2, amount_due: null, paid: '0.00', payment_count: 0 },
          ],
          expenses: [{ amount: '85000.50' }],
        },
        '2026-10-22T15:00:00.000Z',
      ),
    );
  }
  throw Error(`Unexpected QA request: ${url.pathname}`);
};
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/estadisticas']}>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
