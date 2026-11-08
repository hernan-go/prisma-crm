import { generateKeyPairSync, sign } from 'node:crypto';
import type { CustomFetch } from 'openid-client';
import type { Attempt, EvidenceReference, OidcStore, VerifiedGoogle } from '../server/oidc-store';
import { developmentCallback, googleIssuer } from '../server/google-oidc';

// Generated only in tests; no Google credentials or network traffic.
export const options = {
  clientId: 'synthetic-client.apps.googleusercontent.com',
  clientSecret: 'synthetic-test-only',
  redirectUri: developmentCallback,
  activeKeyId: 'test-v1',
  keys: { 'test-v1': 'ab'.repeat(32) },
};
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...key.publicKey.export({ format: 'jwk' }),
  kid: 'test-key',
  alg: 'RS256',
  use: 'sig',
};
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
export function simulatedGoogle() {
  let auth: URL;
  let overrides: Record<string, unknown> = {};
  let algorithm = 'RS256';
  let badSignature = false;
  let unknownKey = false;
  let fail = false;
  let beforeToken: (() => Promise<void>) | undefined;
  let calls = 0;
  const transport: CustomFetch = async (url, init) => {
    if (url.toString() === 'https://www.googleapis.com/oauth2/v3/certs')
      return Response.json({ keys: [jwk] });
    if (url.toString() !== 'https://oauth2.googleapis.com/token')
      throw Error('Unexpected endpoint');
    calls++;
    if (beforeToken) await beforeToken();
    if (fail) throw Error('Synthetic provider failure containing confidential content');
    const body = new URLSearchParams(init?.body as string);
    const verifier = body.get('code_verifier')!;
    const { createHash } = await import('node:crypto');
    if (
      createHash('sha256').update(verifier).digest('base64url') !==
      auth.searchParams.get('code_challenge')
    )
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    if (
      body.get('redirect_uri') !== developmentCallback ||
      body.get('grant_type') !== 'authorization_code'
    )
      throw Error('Bad grant');
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: googleIssuer,
      aud: options.clientId,
      sub: 'synthetic-google-sub',
      iat: now,
      exp: now + 600,
      nonce: auth.searchParams.get('nonce'),
      ...overrides,
    };
    const signing =
      encoded({ alg: algorithm, kid: unknownKey ? 'unknown-key' : 'test-key' }) +
      '.' +
      encoded(claims);
    const signature =
      algorithm === 'none'
        ? ''
        : sign(
            'RSA-SHA256',
            Buffer.from(signing),
            badSignature ? other.privateKey : key.privateKey,
          ).toString('base64url');
    return Response.json({
      token_type: 'Bearer',
      access_token: 'synthetic-access-never-persist',
      id_token: signing + '.' + signature,
    });
  };
  return {
    transport,
    use(
      authorizationUrl: string,
      settings: {
        claims?: Record<string, unknown>;
        algorithm?: string;
        badSignature?: boolean;
        unknownKey?: boolean;
        fail?: boolean;
        beforeToken?: () => Promise<void>;
      } = {},
    ) {
      auth = new URL(authorizationUrl);
      overrides = settings.claims ?? {};
      algorithm = settings.algorithm ?? 'RS256';
      badSignature = settings.badSignature ?? false;
      unknownKey = settings.unknownKey ?? false;
      fail = settings.fail ?? false;
      beforeToken = settings.beforeToken;
      const callback = new URL(developmentCallback);
      callback.searchParams.set('state', auth.searchParams.get('state')!);
      callback.searchParams.set('code', 'synthetic-code');
      return callback.href;
    },
    get calls() {
      return calls;
    },
  };
}

// Explicit test double for crypto tests; database semantics are tested separately in MySQL.
export function memoryOidcStore() {
  const rows = new Map<
    string,
    Attempt & { status: string; expires: number; proof?: VerifiedGoogle }
  >();
  const match = (row: Attempt, ref: Omit<EvidenceReference, 'id'>) => {
    if (
      row.browserHash !== ref.browserHash ||
      row.configurationHash !== ref.configurationHash ||
      JSON.stringify(row.context) !== JSON.stringify(ref.context)
    )
      throw Error('Mismatch');
  };
  const store: OidcStore = {
    async create(attempt) {
      const expires = Date.now() + 300000;
      rows.set(attempt.id, { ...attempt, status: 'pending', expires });
      return expires;
    },
    async claim(stateHash, ref) {
      const row = [...rows.values()].find((r) => r.stateHash === stateHash);
      if (!row || row.status !== 'pending' || row.expires <= Date.now()) throw Error('Unavailable');
      match(row, ref);
      row.status = 'claimed';
      return { ...row };
    },
    async verify(ref, proof) {
      const row = rows.get(ref.id)!;
      match(row, ref);
      if (row.status !== 'claimed' || row.expires <= Date.now()) throw Error('Unavailable');
      row.status = 'verified';
      row.proof = proof;
    },
    async invalidate(ref) {
      const row = rows.get(ref.id)!;
      match(row, ref);
      row.status = 'invalidated';
    },
  };
  return { store, rows };
}
