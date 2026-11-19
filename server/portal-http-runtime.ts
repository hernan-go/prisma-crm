import { createPortalSessionService } from './portal-sessions.js';
import { mysqlPortalOidcStore } from './portal-oidc-store.js';
import type { PortalHttpOptions, PortalRecoveryOptions } from './portal-http.js';

export function portalRecoveryEnvironment(): PortalRecoveryOptions | undefined {
  if (!process.env.APP_URL || !process.env.PORTAL_CSRF_KEY) return undefined;
  return {
    origin: process.env.APP_URL,
    csrfKey: process.env.PORTAL_CSRF_KEY,
    sessions: createPortalSessionService(),
  };
}

// Optional composition only. Missing configuration never queries DB or activates policy.
export function portalEnvironment(): PortalHttpOptions | undefined {
  try {
    if (!process.env.PORTAL_GOOGLE_REDIRECT_URI || !process.env.PORTAL_CSRF_KEY) return undefined;
    return {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: process.env.PORTAL_GOOGLE_REDIRECT_URI,
        activeKeyId: process.env.OIDC_ACTIVE_KEY_ID!,
        keys: JSON.parse(process.env.OIDC_KEYS_JSON || 'null'),
      },
      csrfKey: process.env.PORTAL_CSRF_KEY,
      sessions: createPortalSessionService(),
      store: mysqlPortalOidcStore(),
    };
  } catch {
    return undefined;
  }
}
