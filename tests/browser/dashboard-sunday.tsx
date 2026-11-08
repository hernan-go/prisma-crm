// Synthetic read-only QA: no Express/MySQL, credentials or personal data.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../../client/Dashboard';
import { PeriodContext } from '../../client/App';
import '../../client/styles.css';
const NativeDate = Date;
globalThis.Date = new Proxy(NativeDate, {
  construct(target, args) {
    return Reflect.construct(target, args.length ? args : ['2026-11-08T15:00:00Z']);
  },
  get(target, key) {
    return key === 'now'
      ? () => new NativeDate('2026-11-08T15:00:00Z').getTime()
      : Reflect.get(target, key);
  },
});
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
const empty = new URLSearchParams(location.search).has('empty');
client.setQueryData(
  ['agenda', 4],
  empty
    ? []
    : [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        id: day + 1,
        period_id: 4,
        activity: `Taller sintético ${day}`,
        active: 1,
        offered: 1,
        catalog_active: 1,
        day,
        start: '10:00',
        end: '11:00',
        instructors: [],
        people: [],
      })),
);
client.setQueryData(['dashboard', 4], {
  people: 0,
  enrollments: 0,
  due: '0',
  paid: '0',
  pending: '0',
  credit: '0',
  undefined_accounts: 0,
  wallets: {
    jesica: { cash: '0', transfer: '0', total: '0' },
    hernan: { cash: '0', transfer: '0', total: '0' },
  },
  activities: [],
});
globalThis.fetch = async () => Response.json({}, { status: 503 });
createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <QueryClientProvider client={client}>
      <PeriodContext.Provider
        value={{ period: 4, periods: [{ id: 4, year: 2026, month: 11, status: 'open' }] }}
      >
        <Dashboard />
      </PeriodContext.Provider>
    </QueryClientProvider>
  </MemoryRouter>,
);
