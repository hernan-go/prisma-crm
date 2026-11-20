import {
  Router,
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import type { CustomFetch } from 'openid-client';
import { createPortalGoogleOidc, type GoogleOidcOptions } from './google-oidc.js';
import { digest, opaque, validOpaque } from './oidc-crypto.js';
import { AppError } from './errors.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { portalReturnPage, portalRecoveryPage } from './portal-pages.js';
import {
  portalCorrelationCookie,
  type PortalEvidenceReference,
  type PortalOidcContext,
  type PortalOidcStore,
} from './portal-oidc-contracts.js';
import type { PortalBrowserCredentials } from './portal-sessions.js';

export interface PortalHttpSessions {
  logout(credentials: {
    portalTokens: string[];
    correlation?: { id: string; browserHash: string };
  }): Promise<void>;
  available(): Promise<void>;
  expectedCrm(credentials: PortalBrowserCredentials): Promise<string | null>;
  finish(
    reference: PortalEvidenceReference,
    credentials: PortalBrowserCredentials,
  ): Promise<{ token: string; expiresAt: number; userId: string; instructorId: number }>;
  authenticate(
    token: string,
    credentials: PortalBrowserCredentials,
  ): Promise<{ userId: string; instructorId: number; expiresAt: number; displayName?: string }>;
}
export interface PortalHttpOptions {
  google: GoogleOidcOptions;
  csrfKey: string;
  sessions: PortalHttpSessions;
  store: PortalOidcStore & {
    contextForCallback(id: string, browserHash: string): Promise<PortalOidcContext>;
  };
  transport?: CustomFetch; // Trusted synthetic adapter; never supplied by an HTTP request.
}
export interface PortalRecoveryOptions {
  origin: string;
  csrfKey: string;
  sessions: Pick<PortalHttpSessions, 'logout'>;
}

// Relative to /api/portal. These contracts do not authorize any operation.
export const portalAuthRoutes = [
  { method: 'GET', path: '/auth/logout-csrf' },
  { method: 'GET', path: '/auth/session' },
  { method: 'POST', path: '/auth/google/start' },
  { method: 'GET', path: '/auth/google/callback' },
  { method: 'POST', path: '/auth/google/finish' },
  { method: 'POST', path: '/auth/logout' },
] as const satisfies ReadonlyArray<{ method: 'GET' | 'POST'; path: string }>;

export const portalUnavailable: RequestHandler = (_req, res) => {
  res.set('Cache-Control', 'no-store').status(503).json({
    code: 'portal_unavailable',
    message: 'Portal no disponible.',
  });
};

function cookieValues(req: Request, names: string[]) {
  return (req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .flatMap((v) => {
      const index = v.indexOf('=');
      return names.includes(index < 0 ? v : v.slice(0, index))
        ? [index < 0 ? '' : v.slice(index + 1)]
        : [];
    });
}
export function portalBrowserCredentials(req: Request): PortalBrowserCredentials {
  return {
    crmTokens: cookieValues(req, ['prisma_identity', '__Host-prisma_identity']),
    legacyPresent: cookieValues(req, ['prisma_admin', '__Host-prisma_admin']).length > 0,
    portalTokens: cookieValues(req, ['prisma_portal', '__Host-prisma_portal']),
  };
}
function singleCookie(req: Request, name: string) {
  const values = cookieValues(req, [name]);
  return values.length === 1 ? values[0] : undefined;
}
function responseError(res: Response, status: number, code: string) {
  return res
    .set('Cache-Control', 'no-store')
    .status(status)
    .json({ code, message: 'No se pudo completar la solicitud portal.' });
}
function safeError(error: unknown, res: Response) {
  if (error instanceof AppError && [400, 401, 403, 409, 503].includes(error.status)) {
    const code = (
      {
        400: 'portal_attempt_invalid',
        401: 'portal_credentials_invalid',
        403: 'portal_access_denied',
        409: 'portal_identity_conflict',
        503: 'portal_unavailable',
      } as Record<number, string>
    )[error.status];
    return responseError(res, error.status, code);
  }
  return responseError(res, 503, 'portal_unavailable');
}

// No activation flag: configuration permits constructing the adapter; persistent
// policy is checked on every functional request, including the technical page.
export function createPortalHttp(
  options?: PortalHttpOptions,
  recoveryOptions?: PortalRecoveryOptions,
  home: RequestHandler = (_req, res) => {
    res.sendFile(resolve('dist/client/portal.html'));
  },
) {
  const router = Router();
  const app = Router();
  const secure = process.env.NODE_ENV === 'production';
  const correlation = portalCorrelationCookie(secure);
  const csrfName = secure ? '__Host-prisma_portal_csrf' : 'prisma_portal_csrf';
  const csrfOptions = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 300000,
  };
  let core: ReturnType<typeof createPortalGoogleOidc> | undefined;
  let origin = '';
  let recoveryConfig: PortalRecoveryOptions | undefined;
  try {
    const candidate =
      recoveryOptions ??
      (options
        ? {
            origin: new URL(options.google.redirectUri).origin,
            csrfKey: options.csrfKey,
            sessions: options.sessions,
          }
        : undefined);
    if (!candidate || !/^[a-f0-9]{64}$/.test(candidate.csrfKey)) throw Error();
    const url = new URL(candidate.origin);
    if (
      url.origin !== candidate.origin ||
      url.username ||
      url.password ||
      (!secure && candidate.origin !== 'http://localhost:5173' && url.protocol !== 'https:') ||
      (secure && (url.protocol !== 'https:' || candidate.origin !== process.env.APP_URL))
    )
      throw Error();
    recoveryConfig = candidate;
    origin = candidate.origin;
  } catch {
    recoveryConfig = undefined;
  }
  try {
    if (!options || !recoveryConfig || options.csrfKey !== recoveryConfig.csrfKey) throw Error();
    core = createPortalGoogleOidc(options.google, options.store, options.transport);
    if (new URL(options.google.redirectUri).origin !== origin) throw Error();
  } catch {
    core = undefined;
  }
  const correlationFor = (req: Request) => {
    const raw = singleCookie(req, correlation.name);
    if (!raw || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(raw)) throw new AppError(401, '');
    const [id, browserToken] = raw.split('.');
    return { id, browserToken, raw };
  };
  const csrfSignature = (timestamp: string, secret: string, binding: string) =>
    createHmac('sha256', Buffer.from(recoveryConfig!.csrfKey, 'hex'))
      .update(JSON.stringify(['portal-csrf-v1', timestamp, secret, binding]))
      .digest('hex');
  const csrfToken = (req: Request, res: Response, binding: string) => {
    let secret = singleCookie(req, csrfName);
    if (!secret || !validOpaque(secret)) {
      secret = opaque();
      res.cookie(csrfName, secret, csrfOptions);
    }
    const timestamp = String(Date.now());
    return timestamp + '.' + csrfSignature(timestamp, secret, binding);
  };
  const verifyCsrf = (req: Request, binding: string) => {
    if (req.get('origin') !== origin || req.get('sec-fetch-site') === 'cross-site')
      throw new AppError(403, '');
    const value = req.get('x-portal-csrf') ?? '';
    const secret = singleCookie(req, csrfName);
    const match = /^(\d{13})\.([a-f0-9]{64})$/.exec(value);
    if (
      !match ||
      !secret ||
      !validOpaque(secret) ||
      Number(match[1]) > Date.now() ||
      Date.now() - Number(match[1]) >= 300000
    )
      throw new AppError(403, '');
    const expected = csrfSignature(match[1], secret, binding);
    if (!timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(expected, 'hex')))
      throw new AppError(403, '');
  };
  const recovery = (req: Request) => {
    const portalTokens = portalBrowserCredentials(req).portalTokens;
    if (portalTokens.length > 1) throw new AppError(409, '');
    if (portalTokens.some((t) => !/^[a-f0-9]{64}$/.test(t))) throw new AppError(401, '');
    const rawAttempts = cookieValues(req, ['prisma_portal_login', '__Host-prisma_portal_login']);
    if (rawAttempts.length > 1) throw new AppError(409, '');
    const raw = rawAttempts[0];
    let parsed: { id: string; browserHash: string } | undefined;
    if (raw !== undefined) {
      const [id, browser, ...extra] = raw.split('.');
      if (
        extra.length ||
        !z.string().uuid().safeParse(id).success ||
        !browser ||
        !validOpaque(browser)
      )
        throw new AppError(401, '');
      parsed = { id, browserHash: digest(browser) };
    }
    return {
      binding: JSON.stringify(['logout', portalTokens[0] ?? null, raw ?? null]),
      credentials: { portalTokens, ...(parsed ? { correlation: parsed } : {}) },
    };
  };
  const guard: RequestHandler = async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!core) return portalUnavailable(req, res, next);
    try {
      await options!.sessions.available();
      const credentials = portalBrowserCredentials(req);
      if (
        credentials.portalTokens.length !== 1 ||
        !/^[a-f0-9]{64}$/.test(credentials.portalTokens[0])
      )
        throw new AppError(401, '');
      res.locals.portal = await options!.sessions.authenticate(
        credentials.portalTokens[0],
        credentials,
      );
      next();
    } catch (error) {
      safeError(error, res);
    }
  };
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'portal_rate_limited' },
    }),
  );
  for (const path of ['/auth/google/start', '/auth/google/callback'])
    router.use(
      path,
      rateLimit({
        windowMs: 900000,
        limit: path.endsWith('start') ? 10 : 30,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { code: 'portal_rate_limited' },
      }),
    );
  let exchanging = 0;
  for (const route of portalAuthRoutes) {
    router.all(route.path, async (req, res, next) => {
      // Explicitly reject implicit GET -> HEAD and automatic OPTIONS success.
      if (req.method !== route.method) {
        res.set('Allow', route.method).status(405).json({
          code: 'portal_method_not_allowed',
          message: 'Método no permitido.',
        });
        return;
      }
      const recoveryRoute = route.path === '/auth/logout-csrf' || route.path === '/auth/logout';
      if (recoveryRoute ? !recoveryConfig : !core) return portalUnavailable(req, res, next);
      try {
        if (route.path === '/auth/logout-csrf' || route.path === '/auth/logout') {
          const context = recovery(req);
          if (route.path === '/auth/logout-csrf')
            return res.json({ csrf: csrfToken(req, res, context.binding) });
          verifyCsrf(req, context.binding);
          await recoveryConfig!.sessions.logout(context.credentials);
          const portalName = secure ? '__Host-prisma_portal' : 'prisma_portal';
          const sessionOptions = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
          res.clearCookie(portalName, sessionOptions);
          const { maxAge: _correlationAge, ...correlationClear } = correlation.options;
          const { maxAge: _csrfAge, ...csrfClear } = csrfOptions;
          res.clearCookie(correlation.name, correlationClear);
          res.clearCookie(csrfName, csrfClear);
          // Remove a lone prior-environment credential too, without touching CRM.
          for (const name of ['prisma_portal', '__Host-prisma_portal'])
            if (name !== portalName && cookieValues(req, [name]).length)
              res.clearCookie(name, {
                ...sessionOptions,
                secure: name.startsWith('__Host-') || secure,
              });
          for (const name of ['prisma_portal_login', '__Host-prisma_portal_login'])
            if (name !== correlation.name && cookieValues(req, [name]).length)
              res.clearCookie(name, {
                ...correlationClear,
                secure: name.startsWith('__Host-') || secure,
              });
          return res.json({ authenticated: false });
        }
        if (!core) return portalUnavailable(req, res, next);
        await options!.sessions.available();
        const credentials = portalBrowserCredentials(req);
        if (route.path === '/auth/session') {
          if (!credentials.portalTokens.length)
            return res.json({ authenticated: false, csrf: csrfToken(req, res, 'start') });
          if (
            credentials.portalTokens.length !== 1 ||
            !/^[a-f0-9]{64}$/.test(credentials.portalTokens[0])
          )
            throw new AppError(401, '');
          const session = await options!.sessions.authenticate(
            credentials.portalTokens[0],
            credentials,
          );
          if (!session.displayName?.trim()) throw new AppError(503, '');
          return res.json({
            authenticated: true,
            expiresAt: session.expiresAt,
            identity: { displayName: session.displayName, context: 'facilitator' },
          });
        }
        if (route.path === '/auth/google/start') {
          verifyCsrf(req, 'start');
          const expectedCrmUserId = await options!.sessions.expectedCrm(credentials);
          const attempt = await core.begin({ purpose: 'portal-login', expectedCrmUserId });
          res.cookie(
            correlation.name,
            attempt.attemptId + '.' + attempt.browserToken,
            correlation.options,
          );
          return res.json({ authorizationUrl: attempt.authorizationUrl });
        }
        const browser = correlationFor(req);
        if (route.path === '/auth/google/finish') verifyCsrf(req, browser.raw);
        const context = await options!.store.contextForCallback(
          browser.id,
          digest(browser.browserToken),
        );
        if (route.path === '/auth/google/callback') {
          if (exchanging >= 2) return responseError(res, 429, 'portal_rate_limited');
          exchanging++;
          try {
            if (req.originalUrl.length > 8192) throw Error();
            const callback =
              options!.google.redirectUri +
              (req.originalUrl.includes('?')
                ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
                : '');
            const result = await core.complete(callback, browser.browserToken, context);
            if (result.attemptId !== browser.id) throw Error();
          } catch {
            return responseError(res, 400, 'portal_attempt_invalid');
          } finally {
            exchanging--;
          }
          return res.set('Referrer-Policy', 'no-referrer').redirect(303, '/app/auth/return');
        }
        const session = await options!.sessions.finish(
          core.evidenceReference(browser.id, browser.browserToken, context),
          credentials,
        );
        // The service returns only after commit. Cookie does not renew on reads.
        res.cookie(secure ? '__Host-prisma_portal' : 'prisma_portal', session.token, {
          httpOnly: true,
          secure,
          sameSite: 'strict',
          path: '/',
          maxAge: Math.max(0, Math.min(28800000, session.expiresAt - Date.now())),
        });
        return res.json({
          authenticated: true,
          expiresAt: session.expiresAt,
        });
      } catch (error) {
        if (
          route.path === '/auth/google/callback' &&
          error instanceof AppError &&
          error.status === 401
        )
          return responseError(res, 400, 'portal_attempt_invalid');
        return safeError(error, res);
      }
    });
  }
  router.use((_req, res) => {
    res.status(404).json({ code: 'portal_not_found', message: 'Ruta portal no encontrada.' });
  });
  const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.set('Cache-Control', 'no-store').status(500).json({
      code: 'portal_error',
      message: 'No se pudo completar la solicitud portal.',
    });
  };
  router.use(errorHandler);
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/', async (req, res, next) => {
    if (!core) return portalUnavailable(req, res, next);
    try {
      await options!.sessions.available();
      return home(req, res, next);
    } catch (error) {
      return safeError(error, res);
    }
  });
  app.get('/auth/recovery', (_req, res) => {
    const nonce = opaque();
    res
      .set(
        'Content-Security-Policy',
        `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      )
      .set('Referrer-Policy', 'no-referrer')
      .type('html')
      .send(portalRecoveryPage(nonce));
  });
  app.all('/auth/return', async (req, res, next) => {
    if (req.method !== 'GET')
      return res.set('Allow', 'GET').status(405).json({ code: 'portal_method_not_allowed' });
    if (!core) return portalUnavailable(req, res, next);
    try {
      await options!.sessions.available();
      const browser = correlationFor(req);
      await options!.store.contextForCallback(browser.id, digest(browser.browserToken));
      const csrf = csrfToken(req, res, browser.raw),
        nonce = opaque();
      res
        .set(
          'Content-Security-Policy',
          `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
        )
        .set('Referrer-Policy', 'no-referrer');
      return res.type('html').send(portalReturnPage(csrf, nonce));
    } catch (error) {
      return safeError(error, res);
    }
  });
  app.use(portalUnavailable);
  app.use(errorHandler);
  return { api: router, app, guard };
}

export function portalRouter(options?: PortalHttpOptions) {
  return createPortalHttp(options).api;
}
