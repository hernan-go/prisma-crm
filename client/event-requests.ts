import { ApiError, api } from './api';
import type { EventReceipt } from '../shared/special-events';

export interface PendingEventRequest {
  path: string;
  method: string;
  body: Record<string, unknown>;
}
interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const key = 'prisma-event-request';
// One unresolved command per browser tab. Keep the exact payload through timeout,
// modal dismissal and reload; a new UUID must never stand in for a financial retry.
export class EventRequests {
  private pending: PendingEventRequest | null = null;
  private busy = false;
  private listeners = new Set<() => void>();
  private snapshot: { pending: PendingEventRequest | null; busy: boolean } = {
    pending: null,
    busy: false,
  };
  constructor(
    private storage?: Store,
    private send = (request: PendingEventRequest) =>
      api<EventReceipt>(request.path, request.method, request.body),
  ) {
    const saved = storage?.getItem(key);
    if (saved) {
      try {
        const value = JSON.parse(saved) as PendingEventRequest;
        if (
          typeof value.path === 'string' &&
          /^\/special-events(?:\/|$)/.test(value.path) &&
          ['POST', 'PATCH'].includes(value.method) &&
          typeof value.body?.request_id === 'string'
        )
          this.pending = value;
      } catch {
        /* An unreadable receipt is never used as an executable request. */
      }
    }
    this.snapshot = { pending: this.pending, busy: false };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private notify() {
    this.snapshot = { pending: this.pending, busy: this.busy };
    this.listeners.forEach((listener) => listener());
  }
  async start(path: string, method: string, body: Record<string, unknown>) {
    if (this.pending || this.busy)
      throw Error('Hay un envío por resolver. Reintentá ese mismo envío.');
    if (!this.storage)
      throw Error('El navegador debe permitir almacenamiento de sesión para conservar el envío.');
    const request = { path, method, body: { ...body, request_id: crypto.randomUUID() } };
    // Fail before sending if the browser cannot retain a recovery receipt.
    this.storage?.setItem(key, JSON.stringify(request));
    this.pending = request;
    return this.retry();
  }
  async retry() {
    if (!this.pending || this.busy) throw Error('No hay un envío disponible para reintentar.');
    this.busy = true;
    this.notify();
    try {
      const result = await this.send(this.pending);
      this.storage?.removeItem(key);
      this.pending = null;
      return result;
    } catch (error) {
      // A 5xx/timeout may arrive after a commit: preserve the same key and payload.
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408
      ) {
        this.storage?.removeItem(key);
        this.pending = null;
      }
      throw error;
    } finally {
      this.busy = false;
      this.notify();
    }
  }
}
let storage: Store | undefined;
try {
  if (typeof window !== 'undefined') storage = window.sessionStorage;
} catch {
  /* start will reject safely below */
}
export const eventRequests = new EventRequests(storage);
