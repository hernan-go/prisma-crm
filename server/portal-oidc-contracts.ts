import { z } from 'zod';
import type { CookieOptions } from 'express';
import type { Attempt, EvidenceReference, OidcStore, VerifiedGoogle } from './oidc-store.js';

// Only the trusted same-origin start consumer may supply this identity, after
// resolving CRM credentials. An external callback cannot infer it from absent cookies.
export const portalOidcContextSchema = z
  .object({
    purpose: z.literal('portal-login'),
    expectedCrmUserId: z.string().uuid().nullable(),
  })
  .strict();
export type PortalOidcContext = z.infer<typeof portalOidcContextSchema>;
export type PortalOidcAttempt = Attempt<PortalOidcContext>;
export type PortalEvidenceReference = EvidenceReference<PortalOidcContext>;
export type PortalOidcStore = OidcStore<PortalOidcContext>;
export interface PortalVerifiedEvidence extends VerifiedGoogle {
  beginSeq: string;
  emergencyEpoch: string;
  expectedCrmUserId: string | null;
}

// Contract only: no route writes this cookie in Block 2. Retain correlation for
// cancellation races; cookie lifetime does NOT extend the five-minute DB attempt.
export function portalCorrelationCookie(production: boolean) {
  return {
    name: production ? '__Host-prisma_portal_login' : 'prisma_portal_login',
    options: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: '/',
      maxAge: (8 * 60 * 60 + 5 * 60) * 1000,
    } satisfies CookieOptions,
  };
}
