import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { membershipPhone } from '../client/whatsapp-phone';
it('separates delayed period responses and deduplicates simultaneous subscribers', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finish!: (value: { id: number; telefono: string }[]) => void;
  const slow = vi.fn(
    () =>
      new Promise<{ id: number; telefono: string }[]>((resolve) => {
        finish = resolve;
      }),
  );
  const first = {
    queryKey: ['memberships', '/periods/1/memberships'],
    queryFn: slow,
    staleTime: 30000,
  };
  const observer = new QueryObserver(client, first);
  const stop = observer.subscribe(() => {});
  const pending = client.fetchQuery(first);
  observer.setOptions({
    queryKey: ['memberships', '/periods/2/memberships'],
    queryFn: async () => [{ id: 2, telefono: '' }],
    staleTime: 30000,
  });
  await client.fetchQuery({
    queryKey: ['memberships', '/periods/2/memberships'],
    queryFn: async () => [{ id: 2, telefono: '' }],
  });
  finish([{ id: 2, telefono: '3410000000' }]);
  await pending;
  expect(slow).toHaveBeenCalledTimes(1);
  expect(membershipPhone(observer.getCurrentResult().data, 2)).toBe('');
  stop();
  client.clear();
});
