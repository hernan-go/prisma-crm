// Explicitly activated server-only core. Importing this file does not configure auth,
// query MySQL or mount routes. Transport/store are trusted composition seams.
import { randomUUID } from 'node:crypto';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { digest, oidcFailure, opaque, pkceVault, validOpaque } from './oidc-crypto.js';
import { contextSchema, type EvidenceReference, type OidcStore } from './oidc-store.js';
import { portalOidcContextSchema, type PortalOidcStore } from './portal-oidc-contracts.js';

export const googleIssuer = 'https://accounts.google.com';
export const developmentCallback = 'http://localhost:5173/api/auth/google/callback';
const callbackPath = '/api/auth/google/callback';
export const portalDevelopmentCallback = 'http://localhost:5173/api/portal/auth/google/callback';
const portalCallbackPath = '/api/portal/auth/google/callback';
// Google's published OIDC metadata. Pinned endpoints prevent discovery metadata or
// incoming request headers from redirecting client credentials to another server.
const endpoints = {
  issuer: googleIssuer,
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  id_token_signing_alg_values_supported: ['RS256'],
  response_types_supported: ['code'],
  code_challenge_methods_supported: ['S256'],
};
export interface GoogleOidcOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
}
const credentials = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/),
  clientSecret: z.string().min(1).max(1024),
});
function validatedCallback(value: string, path: string, development: string) {
  const url = new URL(value);
  if (
    value !== development &&
    (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw oidcFailure();
  if (
    url.pathname !== path ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.href !== value
  )
    throw oidcFailure();
  return value;
}
export function createGoogleOidc(
  options: GoogleOidcOptions,
  store: OidcStore,
  transport?: oidc.CustomFetch,
) {
  return createCore(
    options,
    store,
    contextSchema,
    'crm',
    callbackPath,
    developmentCallback,
    transport,
  );
}

export function createPortalGoogleOidc(
  options: GoogleOidcOptions,
  store: PortalOidcStore,
  transport?: oidc.CustomFetch,
) {
  return createCore(
    options,
    store,
    portalOidcContextSchema,
    'portal',
    portalCallbackPath,
    portalDevelopmentCallback,
    transport,
  );
}

// Application/profile is selected only by the two server factories above.
function createCore<C extends { purpose: string }>(
  options: GoogleOidcOptions,
  store: OidcStore<C>,
  schema: z.ZodType<C>,
  application: 'crm' | 'portal',
  path: string,
  development: string,
  transport?: oidc.CustomFetch,
) {
  let redirectUri: string;
  let vault: ReturnType<typeof pkceVault>;
  let config: oidc.Configuration;
  try {
    credentials.parse(options);
    redirectUri = validatedCallback(options.redirectUri, path, development);
    vault = pkceVault(options.activeKeyId, options.keys);
    config = new oidc.Configuration(
      endpoints,
      options.clientId,
      {
        id_token_signed_response_alg: 'RS256',
        [oidc.clockTolerance]: 0,
      },
      oidc.ClientSecretPost(options.clientSecret),
    );
    config.timeout = 10;
    if (transport) config[oidc.customFetch] = transport;
    oidc.enableNonRepudiationChecks(config);
  } catch {
    throw oidcFailure();
  }
  const clientId = options.clientId;
  const configurationHash = digest(
    JSON.stringify([googleIssuer, clientId, redirectUri, application]),
  );
  const refFor = (id: string, browserToken: string, context: C): EvidenceReference<C> => {
    if (!validOpaque(browserToken)) throw oidcFailure();
    return {
      id,
      browserHash: digest(browserToken),
      configurationHash,
      context: schema.parse(context),
    };
  };
  return {
    async begin(context: C, browserCorrelation?: string) {
      try {
        const checked = schema.parse(context);
        const id = randomUUID(),
          state = opaque(),
          nonce = opaque(),
          verifier = opaque(),
          browserToken = browserCorrelation ?? opaque();
        if (!validOpaque(browserToken)) throw oidcFailure();
        const stateHash = digest(state);
        // Bind ciphertext to immutable attempt/context/configuration, preventing DB row swaps.
        const associatedData = JSON.stringify([id, stateHash, configurationHash, checked]);
        const sealed = vault.seal(verifier, associatedData);
        const url = oidc.buildAuthorizationUrl(config, {
          response_type: 'code',
          redirect_uri: redirectUri,
          scope: 'openid email',
          state,
          nonce,
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
          code_challenge_method: 'S256',
          ...(application === 'portal' ? { prompt: 'select_account' } : {}),
          ...(checked.purpose === 'reauth'
            ? {
                max_age: '300',
                claims: JSON.stringify({ id_token: { auth_time: { essential: true } } }),
              }
            : {}),
        });
        const expiresAt = await store.create({
          id,
          configurationHash,
          stateHash,
          browserHash: digest(browserToken),
          nonce,
          keyId: sealed.keyId,
          encrypted: sealed.encrypted,
          context: checked,
        });
        // browserToken is ONLY for a future HttpOnly correlation cookie. Never send it to Google.
        return { attemptId: id, authorizationUrl: url.href, browserToken, expiresAt };
      } catch {
        throw oidcFailure();
      }
    },
    async complete(callbackUrl: string, browserToken: string, context: C) {
      let reference: EvidenceReference<C> | undefined;
      try {
        const checked = schema.parse(context);
        if (!validOpaque(browserToken)) throw oidcFailure();
        const url = new URL(callbackUrl);
        if (url.origin + url.pathname !== redirectUri || url.username || url.password || url.hash)
          throw oidcFailure();
        const states = url.searchParams.getAll('state');
        if (states.length !== 1 || !validOpaque(states[0])) throw oidcFailure();
        // claim commits and wipes persisted PKCE/nonce BEFORE any external request.
        const claimed = await store.claim(digest(states[0]), {
          browserHash: digest(browserToken),
          configurationHash,
          context: checked,
        });
        reference = refFor(claimed.id, browserToken, checked);
        const verifier = vault.open(
          claimed.keyId,
          claimed.encrypted,
          JSON.stringify([claimed.id, claimed.stateHash, configurationHash, checked]),
        );
        const tokens = await oidc.authorizationCodeGrant(config, url, {
          expectedState: states[0],
          expectedNonce: claimed.nonce,
          pkceCodeVerifier: verifier,
          idTokenExpected: true,
          ...(checked.purpose === 'reauth' ? { maxAge: 300 } : {}),
        });
        const claims = tokens.claims();
        const time = Math.floor(Date.now() / 1000);
        if (
          !claims ||
          typeof claims.sub !== 'string' ||
          !/^[\x21-\x7e]{1,255}$/.test(claims.sub) ||
          claims.iss !== googleIssuer ||
          (claims.azp !== undefined && claims.azp !== clientId) ||
          !Number.isSafeInteger(claims.iat) ||
          !Number.isSafeInteger(claims.exp) ||
          !Number.isSafeInteger(claims.iat * 1000) ||
          !Number.isSafeInteger(claims.exp * 1000) ||
          claims.iat < 0 ||
          claims.iat > time + 30 ||
          claims.exp <= time ||
          claims.exp <= claims.iat ||
          (claims.auth_time !== undefined &&
            (!Number.isSafeInteger(claims.auth_time) ||
              !Number.isSafeInteger(claims.auth_time * 1000) ||
              claims.auth_time < 0 ||
              claims.auth_time > time + 30 ||
              claims.auth_time > claims.iat))
        )
          throw oidcFailure();
        await store.verify(reference, {
          subject: claims.sub,
          issuedAt: claims.iat * 1000,
          expiresAt: claims.exp * 1000,
          authenticationTime: claims.auth_time === undefined ? null : claims.auth_time * 1000,
        });
        // Only an opaque reference leaves the callback. No Google tokens or untrusted claims.
        return { attemptId: claimed.id };
      } catch {
        if (reference) {
          try {
            await store.invalidate(reference);
          } catch {
            /* Claimed rows cannot be replayed even if DB is unavailable. */
          }
        }
        throw oidcFailure();
      }
    },
    // B2 passes this reference to consumeEvidence inside its OWN effect transaction.
    evidenceReference(id: string, browserToken: string, context: C) {
      try {
        return refFor(z.string().uuid().parse(id), browserToken, context);
      } catch {
        throw oidcFailure();
      }
    },
    async invalidate(id: string, browserToken: string, context: C) {
      try {
        await store.invalidate(refFor(id, browserToken, context));
      } catch {
        throw oidcFailure();
      }
    },
  };
}
