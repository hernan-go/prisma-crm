import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { PortalView } from '../client/portal/PortalView';
import { portalClient, PortalError } from '../client/portal/http';

afterEach(() => vi.unstubAllGlobals());
const render = (state: any) =>
  renderToStaticMarkup(
    createElement(PortalView, {
      state,
      busy: false,
      onLogin() {},
      onLogout() {},
      onRetry() {},
    }),
  );
it('welcomes anonymous users with an accessible Google control', () => {
  const html = render({ kind: 'anonymous', csrf: 'synthetic' });
  expect(html).toContain('Ingresar con Google');
  expect(html).toContain('<main');
  expect(html).toContain('Servicio disponible');
});
it('only presents the authorized name and portal context', () => {
  const html = render({
    kind: 'authenticated',
    identity: { displayName: 'Persona <QA>', context: 'facilitator' },
    expiresAt: Date.now() + 60000,
  });
  expect(html).toContain('Persona &lt;QA&gt;');
  expect(html).toContain('Facilitador');
  expect(html).toContain('Cerrar sesión');
  expect(html).not.toContain('Administrador');
  expect(html).not.toContain('Ingresar con Google');
});
it.each(['loading', 'expired', 'conflict', 'unavailable', 'denied', 'error'])(
  'renders %s safely with recovery',
  (kind) => {
    const html = render({ kind });
    expect(html).toContain(kind === 'loading' ? 'Comprobando' : 'Volver a comprobar');
    if (kind !== 'loading') expect(html).toContain('Cerrar sesión');
    expect(html).not.toContain('Ingresar con Google');
  },
);
it('uses the portal endpoints, credentials, no-store and logout CSRF in order', async () => {
  const calls: [string, RequestInit | undefined][] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return new Response(
      JSON.stringify(
        url.endsWith('logout-csrf')
          ? { csrf: 'bound-csrf' }
          : url.endsWith('session')
            ? { authenticated: false, csrf: 'start-csrf' }
            : { authenticated: false },
      ),
    );
  });
  await portalClient.session();
  await portalClient.logout();
  expect(calls.map(([url]) => url)).toEqual([
    '/api/portal/auth/session',
    '/api/portal/auth/logout-csrf',
    '/api/portal/auth/logout',
  ]);
  for (const [, init] of calls)
    expect(init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
  expect(calls[2][1]).toMatchObject({ method: 'POST', headers: { 'X-Portal-CSRF': 'bound-csrf' } });
});
it('starts with portal CSRF and accepts only the exact Google authorization destination', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic',
        }),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(await portalClient.start('start-csrf')).toContain('https://accounts.google.com/');
  expect(fetcher).toHaveBeenCalledWith(
    '/api/portal/auth/google/start',
    expect.objectContaining({ method: 'POST', headers: { 'X-Portal-CSRF': 'start-csrf' } }),
  );
  for (const authorizationUrl of [
    'not a URL',
    'https://evil.invalid/',
    'javascript:alert(1)',
    'https://accounts.google.com@evil.invalid/',
    'https://accounts.google.com/other',
  ]) {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl })));
    await expect(portalClient.start('csrf')).rejects.toBeInstanceOf(PortalError);
  }
});
it.each([401, 403, 409, 429, 503])(
  'maps HTTP %s without reflecting private server details',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ message: 'private detail' }), { status }),
    );
    await expect(portalClient.session()).rejects.toMatchObject({ status });
  },
);
it('rejects malformed session contracts and does not claim failed logout', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(JSON.stringify({ authenticated: true, userId: 'private', roles: ['admin'] })),
  );
  await expect(portalClient.session()).rejects.toBeInstanceOf(PortalError);
  await expect(portalClient.logout()).rejects.toBeInstanceOf(PortalError);
});
