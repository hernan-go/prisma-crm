import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createGoogleOidc, developmentCallback } from '../server/google-oidc';
import { digest, opaque, pkceVault } from '../server/oidc-crypto';
import { memoryOidcStore, options, simulatedGoogle } from './oidc-helper';

function setup() {
  const memory = memoryOidcStore(),
    google = simulatedGoogle();
  return { ...memory, google, core: createGoogleOidc(options, memory.store, google.transport) };
}
it('uses PKCE S256 and verified Google sub, returns only an opaque reference', async () => {
  const { core, rows, google } = setup();
  const attempt = await core.begin({ purpose: 'login' });
  const auth = new URL(attempt.authorizationUrl);
  expect(auth.origin).toBe('https://accounts.google.com');
  expect(auth.searchParams.get('redirect_uri')).toBe(developmentCallback);
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
  expect(auth.searchParams.get('response_type')).toBe('code');
  expect(auth.searchParams.get('scope')).not.toContain('offline');
  expect(auth.searchParams.get('state')).not.toBe(auth.searchParams.get('nonce'));
  expect(attempt.authorizationUrl).not.toContain(attempt.browserToken);
  const result = await core.complete(
    google.use(attempt.authorizationUrl, { claims: { email: 'not-an-authority@example.invalid' } }),
    attempt.browserToken,
    { purpose: 'login' },
  );
  expect(result).toEqual({ attemptId: attempt.attemptId });
  expect(rows.get(result.attemptId)?.proof?.subject).toBe('synthetic-google-sub');
  expect(JSON.stringify(rows.get(result.attemptId)?.proof)).not.toContain('email');
  expect(JSON.stringify(rows.get(result.attemptId)?.proof)).not.toContain('access');
});
it.each([
  ['invalid signature', { badSignature: true }],
  ['unknown signing key', { unknownKey: true }],
  ['unsigned token', { algorithm: 'none' }],
  ['unapproved algorithm', { algorithm: 'RS512' }],
  ['incorrect issuer', { claims: { iss: 'https://attacker.invalid' } }],
  ['incorrect audience', { claims: { aud: 'other-client' } }],
  ['incorrect azp with single audience', { claims: { azp: 'other-client' } }],
  ['multiple audiences without azp', { claims: { aud: [options.clientId, 'other-client'] } }],
  [
    'incorrect azp with multiple audiences',
    { claims: { aud: [options.clientId, 'other-client'], azp: 'other-client' } },
  ],
  ['expired token', { claims: { exp: 1 } }],
  ['missing expiry', { claims: { exp: undefined } }],
  ['future issuance', { claims: { iat: 9999999999, exp: 99999999999 } }],
  ['future not-before', { claims: { nbf: 9999999999 } }],
  ['missing nonce', { claims: { nonce: undefined } }],
  ['incorrect nonce', { claims: { nonce: 'incorrect' } }],
  ['missing subject', { claims: { sub: undefined } }],
  ['empty subject', { claims: { sub: '' } }],
  ['missing issuance', { claims: { iat: undefined } }],
  ['fractional issuance', { claims: { iat: 0.5 } }],
  ['future authentication', { claims: { auth_time: 9999999999 } }],
] as const)('rejects %s cryptographically and burns the attempt', async (_name, settings) => {
  const { core, google, rows } = setup();
  const a = await core.begin({ purpose: 'login' });
  const callback = google.use(a.authorizationUrl, settings);
  await expect(core.complete(callback, a.browserToken, { purpose: 'login' })).rejects.toThrow(
    /^OIDC operation unavailable\.$/,
  );
  expect(rows.get(a.attemptId)?.status).toBe('invalidated');
  await expect(core.complete(callback, a.browserToken, { purpose: 'login' })).rejects.toThrow();
  expect(google.calls).toBe(1);
});
it('accepts multiple audiences only with the matching authorized party', async () => {
  const { core, google } = setup();
  const a = await core.begin({ purpose: 'login' });
  await core.complete(
    google.use(a.authorizationUrl, {
      claims: { aud: [options.clientId, 'other'], azp: options.clientId },
    }),
    a.browserToken,
    { purpose: 'login' },
  );
});
it.each([
  'absent',
  'tampered',
  'duplicate',
  'wrong-browser',
  'wrong-context',
  'wrong-origin',
  'wrong-path',
])('rejects %s correlation before contacting the token endpoint', async (kind) => {
  const { core, google, rows } = setup();
  const a = await core.begin({ purpose: 'login' });
  const callback = new URL(google.use(a.authorizationUrl));
  if (kind === 'absent') callback.searchParams.delete('state');
  if (kind === 'tampered') callback.searchParams.set('state', opaque());
  if (kind === 'duplicate')
    callback.searchParams.append('state', callback.searchParams.get('state')!);
  if (kind === 'wrong-origin') callback.hostname = 'attacker.invalid';
  if (kind === 'wrong-path') callback.pathname = '/other';
  await expect(
    core.complete(
      callback.href,
      kind === 'wrong-browser' ? opaque() : a.browserToken,
      kind === 'wrong-context'
        ? { purpose: 'binding', userId: randomUUID(), operationId: randomUUID() }
        : { purpose: 'login' },
    ),
  ).rejects.toThrow();
  expect(google.calls).toBe(0);
  expect(rows.get(a.attemptId)?.status).toBe('pending');
});
it('restart before claim works; concurrent callbacks and subsequent replay have one winner', async () => {
  const { core, google, store } = setup();
  const a = await core.begin({ purpose: 'login' });
  const restarted = createGoogleOidc(options, store, google.transport);
  const callback = google.use(a.authorizationUrl);
  const results = await Promise.allSettled([
    core.complete(callback, a.browserToken, { purpose: 'login' }),
    restarted.complete(callback, a.browserToken, { purpose: 'login' }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(google.calls).toBe(1);
  await expect(
    restarted.complete(callback, a.browserToken, { purpose: 'login' }),
  ).rejects.toThrow();
});
it('provider failure is sanitized without logging and cannot be retried', async () => {
  const { core, google, rows } = setup();
  const a = await core.begin({ purpose: 'login' });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await expect(
      core.complete(google.use(a.authorizationUrl, { fail: true }), a.browserToken, {
        purpose: 'login',
      }),
    ).rejects.toThrow(/^OIDC operation unavailable\.$/);
    expect(log).not.toHaveBeenCalled();
    expect(rows.get(a.attemptId)?.status).toBe('invalidated');
  } finally {
    log.mockRestore();
  }
});
it.each(['missing-code', 'duplicate-code', 'oauth-error'])(
  'burns a correlated %s response without exchanging credentials',
  async (kind) => {
    const { core, google, rows } = setup();
    const a = await core.begin({ purpose: 'login' });
    const url = new URL(google.use(a.authorizationUrl));
    if (kind === 'missing-code') url.searchParams.delete('code');
    if (kind === 'duplicate-code') url.searchParams.append('code', 'other-code');
    if (kind === 'oauth-error') {
      url.searchParams.delete('code');
      url.searchParams.set('error', 'access_denied');
    }
    await expect(core.complete(url.href, a.browserToken, { purpose: 'login' })).rejects.toThrow(
      /^OIDC operation unavailable\.$/,
    );
    expect(rows.get(a.attemptId)?.status).toBe('invalidated');
    expect(google.calls).toBe(0);
  },
);
it('requires signed auth_time for reauth and rejects stale authentication', async () => {
  for (const authTime of [undefined, 1]) {
    const { core, google } = setup();
    const c = { purpose: 'reauth' as const, userId: randomUUID(), sessionHash: 'a'.repeat(64) };
    const a = await core.begin(c);
    expect(new URL(a.authorizationUrl).searchParams.get('max_age')).toBe('300');
    await expect(
      core.complete(
        google.use(a.authorizationUrl, { claims: { auth_time: authTime } }),
        a.browserToken,
        c,
      ),
    ).rejects.toThrow();
  }
});
it('accepts recent signed auth_time and preserves it as evidence, without granting a session', async () => {
  const { core, google, rows } = setup();
  const c = { purpose: 'reauth' as const, userId: randomUUID(), sessionHash: 'a'.repeat(64) };
  const a = await core.begin(c);
  const time = Math.floor(Date.now() / 1000);
  await core.complete(
    google.use(a.authorizationUrl, { claims: { auth_time: time } }),
    a.browserToken,
    c,
  );
  expect(rows.get(a.attemptId)?.proof?.authenticationTime).toBe(time * 1000);
});
it('encrypts PKCE with authenticated row binding, rotation and strict key validation', () => {
  const vault = pkceVault('v1', { v1: 'ab'.repeat(32) }),
    verifier = opaque(),
    sealed = vault.seal(verifier, 'row-a');
  expect(sealed.encrypted).not.toContain(verifier);
  expect(vault.open(sealed.keyId, sealed.encrypted, 'row-a')).toBe(verifier);
  expect(() => vault.open(sealed.keyId, sealed.encrypted, 'row-b')).toThrow();
  expect(() => vault.open(sealed.keyId, '!' + sealed.encrypted.slice(1), 'row-a')).toThrow();
  expect(() => vault.open('unknown', sealed.encrypted, 'row-a')).toThrow();
  const rotated = pkceVault('v2', { v1: 'ab'.repeat(32), v2: 'cd'.repeat(32) });
  expect(rotated.open(sealed.keyId, sealed.encrypted, 'row-a')).toBe(verifier);
  expect(rotated.seal(verifier, 'row-a').keyId).toBe('v2');
  for (const key of ['', 'ab', 'zz'.repeat(32)])
    expect(() => pkceVault('v1', { v1: key })).toThrow();
  expect(() => pkceVault('missing', { v1: 'ab'.repeat(32) })).toThrow();
});
it('rejects missing configuration, unsafe callbacks and unexpected context fields', async () => {
  const { store } = memoryOidcStore();
  for (const changed of [
    { clientId: '' },
    { clientSecret: '' },
    { keys: {} },
    { redirectUri: 'http://127.0.0.1:5173/api/auth/google/callback' },
    { redirectUri: 'http://localhost:5174/api/auth/google/callback' },
    { redirectUri: developmentCallback + '/' },
    { redirectUri: developmentCallback + '?x=y' },
    { redirectUri: 'https://user:pass@example.invalid/api/auth/google/callback' },
  ])
    expect(() => createGoogleOidc({ ...options, ...changed }, store)).toThrow(
      /^OIDC operation unavailable\.$/,
    );
  const core = createGoogleOidc(options, store);
  await expect(core.begin({ purpose: 'login', userId: randomUUID() } as any)).rejects.toThrow();
});
it('ciphertext is bound to attempt and configuration and is unusable after corruption', async () => {
  const { core, google, rows } = setup();
  const a = await core.begin({ purpose: 'login' });
  rows.get(a.attemptId)!.encrypted = 'a'.repeat(95);
  await expect(
    core.complete(google.use(a.authorizationUrl), a.browserToken, { purpose: 'login' }),
  ).rejects.toThrow();
  expect(google.calls).toBe(0);
  expect(rows.get(a.attemptId)?.status).toBe('invalidated');
  const ref = core.evidenceReference(a.attemptId, a.browserToken, { purpose: 'login' });
  expect(ref.browserHash).toBe(digest(a.browserToken));
});
