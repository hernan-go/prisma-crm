import { describe, it, expect } from 'vitest';
import { EventRequests } from '../client/event-requests';
import { ApiError } from '../client/api';
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe('Envíos de Eventos: idempotencia del navegador', () => {
  it('conserva payload y clave ante pérdida de respuesta, aun al recargar el flujo', async () => {
    const store = storage(),
      calls: unknown[] = [];
    const send = async (request: unknown) => {
      calls.push(structuredClone(request));
      if (calls.length === 1) throw new TypeError('Red interrumpida');
      return { id: 3, revision: 4 };
    };
    const first = new EventRequests(store, send);
    await expect(
      first.start('/special-events/1/participants/2/movements', 'POST', {
        expected_revision: 3,
        amount: '100',
      }),
    ).rejects.toThrow('Red');
    await expect(
      first.start('/special-events/1/participants/2/movements', 'POST', { amount: '200' }),
    ).rejects.toThrow('resolver');
    const restored = new EventRequests(store, send);
    expect(await restored.retry()).toEqual({ id: 3, revision: 4 });
    expect(calls[0]).toEqual(calls[1]);
    expect(restored.getSnapshot().pending).toBeNull();
  });
  it('bloquea doble clic sin esperar un rerender y permite corregir tras rechazo definitivo', async () => {
    let complete!: (value: { id: number; revision: number }) => void;
    const store = storage(),
      client = new EventRequests(
        store,
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
    const sending = client.start('/special-events', 'POST', { name: 'Charla' });
    await expect(client.retry()).rejects.toThrow('disponible');
    await expect(client.start('/special-events', 'POST', {})).rejects.toThrow('resolver');
    complete({ id: 1, revision: 1 });
    await sending;
    const rejected = new EventRequests(store, async () => {
      throw new ApiError('Cambió el evento', 409);
    });
    await expect(rejected.start('/special-events/1', 'PATCH', {})).rejects.toMatchObject({
      status: 409,
    });
    expect(rejected.getSnapshot().pending).toBeNull();
  });
  it('no envía dinero si no puede persistir la recuperación', async () => {
    let sent = false;
    const client = new EventRequests(undefined, async () => {
      sent = true;
      return { id: 1, revision: 1 };
    });
    await expect(client.start('/special-events', 'POST', {})).rejects.toThrow('almacenamiento');
    expect(sent).toBe(false);
  });
  it('conserva el recibo ante 5xx, sin generar un cobro nuevo', async () => {
    const client = new EventRequests(storage(), async () => {
      throw new ApiError('Respuesta incierta', 503);
    });
    await expect(
      client.start('/special-events/1/participants/2/movements', 'POST', { amount: '10' }),
    ).rejects.toMatchObject({ status: 503 });
    const first = client.getSnapshot().pending;
    await expect(client.retry()).rejects.toMatchObject({ status: 503 });
    expect(client.getSnapshot().pending).toEqual(first);
  });
});
