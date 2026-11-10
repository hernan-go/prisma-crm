import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthGate, Logout } from '../client/Auth';
import { api, ApiError } from '../client/api';

const h = vi.hoisted(() => ({
  query: {} as any,
  states: [] as any[],
  cursor: 0,
  effects: [] as (() => any)[],
  mutations: [] as any[],
  navigate: vi.fn(),
  location: { pathname: '/login', search: '' },
  cache: { cancelQueries: vi.fn(), removeQueries: vi.fn(), resetQueries: vi.fn() },
}));
vi.mock('react', async (original) => ({
  ...(await original<object>()),
  useState: (initial: unknown) => {
    const slot = h.cursor++;
    if (!(slot in h.states)) h.states[slot] = initial;
    return [
      h.states[slot],
      (value: unknown) => {
        h.states[slot] = value;
      },
    ];
  },
  useEffect: (effect: () => any) => {
    h.effects.push(effect);
  },
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => h.navigate,
  useLocation: () => h.location,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => h.query,
  useQueryClient: () => h.cache,
  useMutation: (options: any) => {
    const mutation: any = {
      ...options,
      isPending: false,
      error: null,
      mutate: vi.fn(async () => {
        try {
          await options.mutationFn();
          await options.onSuccess?.();
        } catch (error) {
          mutation.error = error;
          options.onError?.(error);
        }
      }),
    };
    h.mutations.push(mutation);
    return mutation;
  },
}));
let tree: ReactNode;
let cleanups: (() => void)[];
const session = (extra = {}) => ({
  authenticated: false,
  configured: true,
  status: 'anonymous',
  legacy: { available: true },
  googleLogin: { available: true, csrf: 'a'.repeat(64) },
  ...extra,
});
function render() {
  h.cursor = 0;
  tree = AuthGate({ children: createElement('div', {}, 'Protected content') });
  return renderToStaticMarkup(tree);
}
function find(node: ReactNode, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return predicate(node) ? node : find(node.props.children, predicate);
}
beforeEach(() => {
  vi.clearAllMocks();
  h.location.search = '';
  h.states = [];
  h.effects = [];
  h.mutations = [];
  cleanups = [];
  h.query = { data: session(), isPending: false, isFetching: false, error: null, refetch: vi.fn() };
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }),
  );
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

it('renders a native Google POST with the exact CSRF field alongside explicit temporary legacy access', () => {
  const html = render();
  expect(html).toContain('Ingresar con Google');
  const form = find(
    tree,
    (n) => n.type === 'form' && n.props.action === '/api/auth/google/login/start',
  );
  expect(form.props.method.toLowerCase()).toBe('post');
  expect(form.props.onSubmit).toBeUndefined();
  const csrf = find(form, (n) => n.type === 'input' && n.props.name === 'csrf');
  expect(csrf.props.type).toBe('hidden');
  expect(csrf.props.value).toBe('a'.repeat(64));
  expect(html).toContain('Acceso compartido temporal');
  expect(html).toContain('type="password"');
  expect(fetch).not.toHaveBeenCalled();
});
it.each([undefined, { available: false }, { available: true }])(
  'hides Google unless the server provides availability AND CSRF: %j',
  (googleLogin) => {
    h.query.data = session({ googleLogin });
    expect(render()).not.toContain('Ingresar con Google');
  },
);
it('recognizes Google identity without requiring legacy configuration and displays the name at logout', () => {
  h.query.data = session({
    authenticated: true,
    configured: false,
    method: 'identity',
    identity: { userId: 'synthetic', displayName: 'Administradora QA', roles: ['admin'] },
  });
  expect(render()).toContain('Protected content');
  expect(render()).not.toContain('password');
  expect(renderToStaticMarkup(createElement(Logout))).toContain('Administradora QA');
});
it('preserves legacy-only compatibility and does not display internal setup commands', () => {
  h.query.data = { authenticated: false, configured: true };
  expect(render()).toContain('type="password"');
  h.query.data = { authenticated: false, configured: false };
  const html = render();
  expect(html).not.toContain('npm run');
  expect(html).toContain('no está disponible');
});
it.each([
  [401, 'venció'],
  [409, 'conflicto'],
  [503, 'no está disponible'],
])('blocks protected content and fallback on HTTP %i', (status, message) => {
  h.query.data = session({ authenticated: true });
  h.query.error = new ApiError('Internal detail must not be shown', status);
  const html = render();
  expect(html).not.toContain('Protected content');
  expect(html).toContain(message);
  expect(html).not.toContain('type="password"');
  expect(html).not.toContain('Internal detail');
});
it('explains an invalid stored identity and offers logout instead of silent method switching', () => {
  h.query.data = session({ status: 'invalid' });
  const html = render();
  expect(html).toContain('venció');
  expect(html).toContain('Cerrar sesión');
  expect(html).not.toContain('type="password"');
  expect(html).not.toContain('Ingresar con Google');
});
it('handles runtime 401/409/503 from the API even with a cached authenticated session', async () => {
  for (const status of [401, 409, 503]) {
    h.states = [];
    h.effects = [];
    h.query.data = session({ authenticated: true });
    expect(render()).toContain('Protected content');
    const active = h.effects.map((effect) => effect()).filter(Boolean);
    h.query.refetch.mockResolvedValueOnce({ error: new ApiError('Session rejected', status) });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({}),
    } as Response);
    await expect(api('/periods')).rejects.toMatchObject({ status });
    await Promise.resolve();
    expect(render()).not.toContain('Protected content');
    active.forEach((cleanup) => cleanup());
  }
});
it('submits legacy only by explicit action and clears its password on failure', async () => {
  render();
  find(tree, (n) => n.type === 'input' && n.props.type === 'password').props.onChange({
    target: { value: 'synthetic-password' },
  });
  render();
  const form = find(tree, (n) => n.type === 'form' && !n.props.action);
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ message: 'Contraseña incorrecta.' }),
  } as Response);
  form.props.onSubmit({ preventDefault: vi.fn() });
  await h.mutations.at(-1).mutate.mock.results[0].value;
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/login',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ password: 'synthetic-password' }),
    }),
  );
  render();
  expect(find(tree, (n) => n.type === 'input' && n.props.type === 'password').props.value).toBe('');
});
it('posts logout, clears cached private data after success and resets the auth gate', async () => {
  h.query.data = session({ status: 'invalid' });
  render();
  cleanups = h.effects.map((effect) => effect()).filter(Boolean);
  Logout();
  const mutation = h.mutations.at(-1);
  await mutation.mutate();
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/logout',
    expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
  );
  expect(h.cache.cancelQueries).toHaveBeenCalled();
  expect(h.cache.removeQueries).toHaveBeenCalled();
  expect(h.cache.resetQueries).toHaveBeenCalledWith({ queryKey: ['auth'], exact: true });
  expect(h.navigate).toHaveBeenCalledWith('/login', { replace: true });
});
it('does not claim logout success or clear cache when the backend fails', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status: 503,
    json: async () => ({}),
  } as Response);
  Logout();
  await h.mutations.at(-1).mutate();
  expect(h.cache.removeQueries).not.toHaveBeenCalled();
  expect(h.navigate).not.toHaveBeenCalled();
});
it.each([409, 503])('keeps a valid session after a business HTTP %i', async (status) => {
  h.query.data = session({ authenticated: true });
  render();
  cleanups = h.effects.map((effect) => effect()).filter(Boolean);
  h.query.refetch.mockResolvedValueOnce({ data: h.query.data, error: null });
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status, json: async () => ({}) } as Response);
  await expect(api('/periods')).rejects.toMatchObject({ status });
  await Promise.resolve();
  expect(h.query.refetch).toHaveBeenCalled();
  expect(render()).toContain('Protected content');
});
it('refreshes session after an explicit successful legacy login', async () => {
  render();
  const form = find(tree, (n) => n.type === 'form' && !n.props.action);
  form.props.onSubmit({ preventDefault: vi.fn() });
  await h.mutations.at(-1).mutate.mock.results[0].value;
  expect(h.cache.resetQueries).toHaveBeenCalledWith({ queryKey: ['auth'], exact: true });
  expect(h.navigate).toHaveBeenCalledWith('/', { replace: true });
});
it('reports unavailable login when an advertised Google method has no CSRF and legacy is disabled', () => {
  h.query.data = session({
    configured: false,
    legacy: { available: false },
    googleLogin: { available: true },
  });
  expect(render()).toContain('no está disponible');
});
it('shows the fixed accessible Google denial notice only for the public code', () => {
  h.location.search = '?google=denied';
  expect(render()).toContain(
    '<p role="alert">No tenés acceso habilitado a PRISMA con esta cuenta. Intentá con tu cuenta autorizada.</p>',
  );
  h.location.search = '?google=unexpected';
  expect(render()).not.toContain('No tenés acceso habilitado');
});
