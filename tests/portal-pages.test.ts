import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { portalReturnPage, portalRecoveryPage } from '../server/portal-pages';
import { portalPresentationSessions } from '../server/portal-http-runtime';
import { createPortalSessionService } from '../server/portal-sessions';
function runReturn(status: number, network = false) {
  const button = { disabled: false };
  let submit: (e?: any) => Promise<void>;
  const form = {
    action: '/api/portal/auth/google/finish',
    elements: { csrf: { value: 'bound-csrf' } },
    hidden: false,
    querySelector: () => button,
    addEventListener: (_: string, callback: typeof submit) => {
      submit = callback;
    },
  };
  const message = { textContent: '' };
  const fetch = vi.fn(async () => {
    if (network) throw Error();
    return { ok: status === 200, status };
  });
  const location = { replace: vi.fn() };
  const html = portalReturnPage('bound-csrf', 'nonce');
  runInNewContext(html.match(/<script[^>]*>([\s\S]*)<\/script>/)![1], {
    document: { getElementById: (id: string) => (id === 'finish' ? form : message) },
    fetch,
    location,
  });
  return { form, message, button, fetch, location, submit: () => submit({ preventDefault() {} }) };
}
it('automatically finishes once and navigates to the fixed local home, ignoring duplicate submits', async () => {
  const f = runReturn(200);
  await f.submit();
  await Promise.resolve();
  expect(f.fetch).toHaveBeenCalledOnce();
  expect(f.fetch).toHaveBeenCalledWith(
    '/api/portal/auth/google/finish',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Portal-CSRF': 'bound-csrf' },
    }),
  );
  expect(f.location.replace).toHaveBeenCalledWith('/app/');
  expect(f.form.hidden).toBe(true);
});
it.each([400, 401, 403, 409, 429, 503])(
  'does not repeat or navigate after return HTTP %s',
  async (status) => {
    const f = runReturn(status);
    await f.submit();
    await Promise.resolve();
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.location.replace).not.toHaveBeenCalled();
    expect(f.message.textContent.length).toBeGreaterThan(10);
    expect(f.button.disabled).toBe(true);
  },
);
it('keeps network ambiguity recoverable without retrying finish', async () => {
  const f = runReturn(0, true);
  await f.submit();
  await Promise.resolve();
  expect(f.message.textContent).toContain('No pudimos confirmar');
  expect(f.fetch).toHaveBeenCalledOnce();
});
it('reads display name only after authorization, with no roles in the projection', async () => {
  const service = createPortalSessionService();
  vi.spyOn(service, 'authenticate').mockResolvedValue({
    userId: 'private',
    instructorId: 1,
    expiresAt: 123,
  });
  const reader = vi.fn(async () => ({
    id: 'private',
    display_name: 'Persona QA',
    status: 'enabled' as const,
    roles: ['admin' as const, 'facilitator' as const],
  }));
  const presentation = portalPresentationSessions(service, reader);
  const result = await presentation.authenticate('synthetic', {
    crmTokens: [],
    legacyPresent: false,
    portalTokens: ['synthetic'],
  });
  expect(result.displayName).toBe('Persona QA');
  expect(result).not.toHaveProperty('roles');
  vi.mocked(service.authenticate).mockRejectedValueOnce(Error('denied'));
  reader.mockClear();
  await expect(
    presentation.authenticate('synthetic', {
      crmTokens: [],
      legacyPresent: false,
      portalTokens: ['synthetic'],
    }),
  ).rejects.toThrow('denied');
  expect(reader).not.toHaveBeenCalled();
});
it('recovery never completes Google and confirms persistent logout before announcing success', async () => {
  let click: () => Promise<void>;
  const button = {
    disabled: false,
    hidden: false,
    addEventListener: (_: string, callback: typeof click) => {
      click = callback;
    },
  };
  const message = { textContent: '' };
  const fetch = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith('logout-csrf') ? { csrf: 'recovery' } : { authenticated: false },
  }));
  runInNewContext(portalRecoveryPage('nonce').match(/<script[^>]*>([\s\S]*)<\/script>/)![1], {
    document: { getElementById: (id: string) => (id === 'logout' ? button : message) },
    fetch,
  });
  await click!();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/portal/auth/logout-csrf',
    '/api/portal/auth/logout',
  ]);
  expect(message.textContent).toContain('Cerraste tu sesión');
});
