import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { usePortalAuth } from '../client/portal/usePortalAuth';
import { setImmediate as settle } from 'node:timers/promises';
const h = vi.hoisted(() => ({
  values: [] as any[],
  cursor: 0,
  effects: [] as { deps?: unknown[]; cleanup?: () => void }[],
  pending: [] as (() => void)[],
}));
vi.mock('react', async (original) => ({
  ...(await original<object>()),
  useState(initial: unknown) {
    const slot = h.cursor++;
    if (!(slot in h.values)) h.values[slot] = initial;
    return [
      h.values[slot],
      (value: unknown) => {
        h.values[slot] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const slot = h.cursor++;
    if (!(slot in h.values)) h.values[slot] = { current: initial };
    return h.values[slot];
  },
  useCallback(callback: unknown) {
    h.cursor++;
    return callback;
  },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) {
    const slot = h.cursor++;
    const previous = h.effects[slot];
    if (!previous || deps?.some((dep, i) => dep !== previous.deps?.[i])) {
      h.pending.push(() => {
        previous?.cleanup?.();
        h.effects[slot] = { deps, cleanup: effect() || undefined };
      });
    }
  },
}));
let model: ReturnType<typeof usePortalAuth>;
let listeners: Record<string, (() => void)[]>;
let session: object;
let failedLogout: boolean;
let delayedSession: (() => void) | undefined;
const realSession = () => ({
  authenticated: true,
  identity: { displayName: 'Persona QA', context: 'facilitator' },
  expiresAt: Date.now() + 60000,
});
async function render() {
  h.cursor = 0;
  model = usePortalAuth();
  const pending = h.pending.splice(0);
  pending.forEach((effect) => effect());
  await settle();
  h.cursor = 0;
  model = usePortalAuth();
  h.pending.splice(0).forEach((effect) => effect());
  return model;
}
beforeEach(() => {
  vi.useFakeTimers();
  h.values = [];
  h.effects = [];
  h.pending = [];
  listeners = {};
  failedLogout = false;
  delayedSession = undefined;
  session = { authenticated: false, csrf: 'start' };
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    addEventListener: (name: string, fn: () => void) => {
      (listeners[name] ??= []).push(fn);
    },
    removeEventListener: () => {},
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/session')) {
      const captured = session;
      if (delayedSession)
        await new Promise<void>((resolve) => {
          delayedSession = resolve;
        });
      return new Response(JSON.stringify(captured));
    }
    if (url.endsWith('logout-csrf')) return new Response(JSON.stringify({ csrf: 'logout' }));
    if (url.endsWith('/logout')) {
      if (failedLogout) return new Response('{}', { status: 503 });
      session = { authenticated: false, csrf: 'new-start' };
      return new Response(JSON.stringify({ authenticated: false }));
    }
    throw Error('Unexpected endpoint');
  });
});
afterEach(() => {
  h.effects.forEach((effect) => effect?.cleanup?.());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('loads an anonymous session and only exposes the login after confirmation', async () => {
  h.cursor = 0;
  expect(usePortalAuth().state.kind).toBe('loading');
  expect((await render()).state.kind).toBe('anonymous');
});
it('expires at the absolute deadline without renewing and rechecks on return to the tab', async () => {
  session = realSession();
  expect((await render()).state.kind).toBe('authenticated');
  await vi.advanceTimersByTimeAsync(60001);
  expect((await render()).state.kind).toBe('expired');
  session = { authenticated: false, csrf: 'fresh' };
  listeners.focus[0]();
  expect((await render()).state.kind).toBe('anonymous');
});
it('clears the identity and confirms persistent logout before returning to login', async () => {
  session = realSession();
  await render();
  model.onLogout();
  await render();
  expect(model.state.kind).toBe('anonymous');
  expect(model.notice).toBe('Cerraste tu sesión.');
});
it('does not announce logout success or restore an old identity after persistence failure', async () => {
  session = realSession();
  await render();
  failedLogout = true;
  model.onLogout();
  await render();
  expect(model.state.kind).toBe('unavailable');
  expect(model.notice).toBe('No pudimos confirmar el cierre de sesión. Volvé a intentar.');
});
it('ignores a stale authenticated read that resolves after logout', async () => {
  session = realSession();
  await render();
  delayedSession = () => {};
  listeners.focus[0]();
  for (let n = 0; n < 4; n++) await Promise.resolve();
  const release = delayedSession;
  model.onLogout();
  delayedSession = undefined;
  await render();
  release?.();
  await render();
  expect(model.state.kind).toBe('anonymous');
});
