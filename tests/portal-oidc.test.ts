import { expect, it, vi } from 'vitest';
import {
  createGoogleOidc,
  createPortalGoogleOidc,
  portalDevelopmentCallback,
} from '../server/google-oidc';
import { memoryOidcStore, options, simulatedGoogle } from './oidc-helper';
import { digest, opaque } from '../server/oidc-crypto';
import type { PortalOidcContext } from '../server/portal-oidc-contracts';
import { portalCorrelationCookie } from '../server/portal-oidc-contracts';

const context: PortalOidcContext = { purpose: 'portal-login', expectedCrmUserId: null };
const portalOptions = {
  ...options,
  redirectUri: 'http://localhost:5173/api/portal/auth/google/callback',
};
function setup() {
  const memory = memoryOidcStore<PortalOidcContext>();
  const google = simulatedGoogle(portalOptions.redirectUri);
  return {
    ...memory,
    google,
    core: createPortalGoogleOidc(portalOptions, memory.store, google.transport),
  };
}

it('isolates configuration, selects account and verifies signed sub without a session', async () => {
  const { core, rows, google } = setup();
  const a = await core.begin(context);
  const url = new URL(a.authorizationUrl);
  expect(url.searchParams.get('redirect_uri')).toBe(portalDevelopmentCallback);
  expect(url.searchParams.get('prompt')).toBe('select_account');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.searchParams.get('nonce')).not.toBe(url.searchParams.get('state'));
  expect(a.authorizationUrl).not.toContain(a.browserToken);
  const ref = core.evidenceReference(a.attemptId, a.browserToken, context);
  expect(ref.configurationHash).toBe(
    digest(
      JSON.stringify([
        'https://accounts.google.com',
        options.clientId,
        portalOptions.redirectUri,
        'portal',
      ]),
    ),
  );
  expect(await core.complete(google.use(a.authorizationUrl), a.browserToken, context)).toEqual({
    attemptId: a.attemptId,
  });
  expect(rows.get(a.attemptId)?.status).toBe('verified');
  expect(rows.get(a.attemptId)?.proof).toMatchObject({ subject: 'synthetic-google-sub' });
  expect(JSON.stringify(rows.get(a.attemptId)?.proof)).not.toMatch(/access_token|id_token|email/);
});

it.each([
  { badSignature: true },
  { algorithm: 'none' },
  { unknownKey: true },
  { claims: { iss: 'https://other.invalid' } },
  { claims: { aud: 'other' } },
  { claims: { nonce: 'other' } },
  { claims: { exp: 1 } },
  { claims: { sub: '' } },
  { claims: { azp: 'other' } },
])('rejects invalid signed evidence %j', async (settings) => {
  const { core, rows, google } = setup();
  const a = await core.begin(context);
  await expect(
    core.complete(google.use(a.authorizationUrl, settings), a.browserToken, context),
  ).rejects.toThrow('OIDC operation unavailable.');
  expect(rows.get(a.attemptId)?.status).toBe('invalidated');
});

it('rejects crossed callbacks, contexts and configuration hashes before Google', async () => {
  const { core, store, google } = setup();
  expect(() => createPortalGoogleOidc(options, store)).toThrow();
  expect(() => createGoogleOidc(portalOptions, memoryOidcStore().store)).toThrow();
  const a = await core.begin(context);
  const callback = new URL(google.use(a.authorizationUrl));
  callback.pathname = '/api/auth/google/callback';
  await expect(core.complete(callback.href, a.browserToken, context)).rejects.toThrow();
  await expect(core.begin({ purpose: 'login' } as never)).rejects.toThrow();
  const other = createPortalGoogleOidc(
    { ...portalOptions, clientId: 'other.apps.googleusercontent.com' },
    store,
    google.transport,
  );
  await expect(
    other.complete(google.use(a.authorizationUrl), a.browserToken, context),
  ).rejects.toThrow();
  expect(google.calls).toBe(0);
});

it.each(['', 'invalid', opaque()])(
  'rejects absent or mismatched correlation %s',
  async (browser) => {
    const { core, google } = setup();
    const a = await core.begin(context);
    await expect(core.complete(google.use(a.authorizationUrl), browser, context)).rejects.toThrow();
    expect(google.calls).toBe(0);
  },
);

it('allows one concurrent callback and rejects replay', async () => {
  const { core, google } = setup();
  const a = await core.begin(context),
    callback = google.use(a.authorizationUrl);
  const results = await Promise.allSettled([
    core.complete(callback, a.browserToken, context),
    core.complete(callback, a.browserToken, context),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(google.calls).toBe(1);
  await expect(core.complete(callback, a.browserToken, context)).rejects.toThrow();
});

it.each(['before', 'during', 'cancel'])(
  'rejects expiration/cancellation %s exchange',
  async (when) => {
    const { core, rows, google } = setup();
    const a = await core.begin(context);
    if (when === 'before') rows.get(a.attemptId)!.expires = 0;
    const callback = google.use(a.authorizationUrl, {
      beforeToken: async () => {
        if (when === 'during') rows.get(a.attemptId)!.expires = 0;
        if (when === 'cancel') await core.invalidate(a.attemptId, a.browserToken, context);
      },
    });
    await expect(core.complete(callback, a.browserToken, context)).rejects.toThrow();
    expect(rows.get(a.attemptId)?.status).not.toBe('verified');
  },
);

it('sanitizes Google and persistence failures without logging', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const failure of ['google', 'create', 'verify', 'invalidate']) {
      const { core, google, store } = setup();
      if (failure === 'create')
        store.create = async () => {
          throw Error('private');
        };
      if (failure === 'create') {
        await expect(core.begin(context)).rejects.toThrow(/^OIDC operation unavailable\.$/);
        continue;
      }
      const a = await core.begin(context);
      if (failure === 'verify')
        store.verify = async () => {
          throw Error('private');
        };
      if (failure === 'invalidate')
        store.invalidate = async () => {
          throw Error('private');
        };
      await expect(
        core.complete(
          google.use(a.authorizationUrl, { fail: failure !== 'verify' }),
          a.browserToken,
          context,
        ),
      ).rejects.toThrow(/^OIDC operation unavailable\.$/);
    }
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it('rejects absent/invalid portal configuration without constructing a live service', () => {
  const { store } = memoryOidcStore<PortalOidcContext>();
  for (const config of [
    undefined,
    { ...portalOptions, clientId: '' },
    { ...portalOptions, redirectUri: 'http://localhost:5174/api/portal/auth/google/callback' },
    { ...portalOptions, redirectUri: portalOptions.redirectUri + '?x=1' },
  ]) {
    expect(() => createPortalGoogleOidc(config as never, store)).toThrow(
      /^OIDC operation unavailable\.$/,
    );
  }
});

it('defines independent correlation cookies without emitting a session', () => {
  const production = portalCorrelationCookie(true);
  expect(production.name).toBe('__Host-prisma_portal_login');
  expect(production.options).toEqual({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 29100000,
  });
  expect(portalCorrelationCookie(false).name).toBe('prisma_portal_login');
  expect(portalCorrelationCookie(false).options.secure).toBe(false);
});

it.each(['missing-state', 'duplicate-state', 'wrong-state', 'oauth-error'])(
  'rejects %s without exchange',
  async (kind) => {
    const { core, google } = setup();
    const a = await core.begin(context),
      url = new URL(google.use(a.authorizationUrl));
    if (kind === 'missing-state') url.searchParams.delete('state');
    if (kind === 'duplicate-state')
      url.searchParams.append('state', url.searchParams.get('state')!);
    if (kind === 'wrong-state') url.searchParams.set('state', opaque());
    if (kind === 'oauth-error') {
      url.searchParams.delete('code');
      url.searchParams.set('error', 'access_denied');
    }
    await expect(core.complete(url.href, a.browserToken, context)).rejects.toThrow();
    expect(google.calls).toBe(0);
  },
);
