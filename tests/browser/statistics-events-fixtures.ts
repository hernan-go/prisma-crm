import type { EventEconomy } from '../../shared/event-economy';

// Local QA only, never imported by the production entrypoint.
export function eventsFixture(period: EventEconomy['period'], empty = false): EventEconomy {
  const wallet = { cash: '0.00', transfer: '0.00', total: '0.00' };
  return {
    version: '1.0',
    period,
    as_of: '2026-11-07T12:00:00Z',
    time_axis: 'economic_period',
    currency: 'ARS',
    income: {
      workshops: '100.00',
      event_collections: empty ? '0.00' : '20.00',
      event_refunds: empty ? '0.00' : '5.00',
      events: empty ? '0.00' : '15.00',
      total: empty ? '100.00' : '115.00',
    },
    event_expenses: empty ? '0.00' : '2.00',
    commercial_gross: empty ? '0.00' : '15.00',
    commercial_pending: '0.00',
    commercial_result: empty ? '0.00' : '13.00',
    warnings: [],
    events: empty
      ? []
      : [
          {
            id: 1,
            event_number: 3,
            name: 'Encuentro sintético',
            date: '2026-11-07',
            status: 'confirmed',
            cancelled_at: null,
            cancelled_participants: null,
            cancellation_reason: null,
            wallets: { jesica: wallet, hernan: wallet },
            active_count: 1,
            registered_count: 1,
            withdrawn_count: 0,
            collections: '20.00',
            refunds: '5.00',
            effective_net: '15.00',
            direct_expenses: '2.00',
            commercial: {
              due: '15.00',
              balance: '0.00',
              gross: '15.00',
              pending: '0.00',
              result: '13.00',
            },
          },
        ],
  };
}
