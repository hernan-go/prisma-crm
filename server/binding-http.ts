import { Router, urlencoded, type Request, type Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { createGoogleOidc, type GoogleOidcOptions } from './google-oidc.js';
import type { CustomFetch } from 'openid-client';
import { mysqlOidcStore } from './oidc-store.js';
import { opaque, validOpaque } from './oidc-crypto.js';
import {
  bindingAttempt,
  bindingContext,
  bindingMaintenance,
  bindingPreflight,
  browserBindings,
} from './binding-operations.js';

export interface BindingHttpOptions {
  google: GoogleOidcOptions;
  csrfKey: string;
  database: string;
  transport?: CustomFetch; // trusted test seam, never HTTP input
}
const startPath = '/api/auth/google/binding/start';
const submitPath = '/api/auth/google/binding/submit';
const cancelPath = '/api/auth/google/binding/cancel';
const callbackPath = '/api/auth/google/callback';
const pagePath = '/vincular-google';
const paths = [startPath, submitPath, cancelPath, callbackPath, pagePath];
const generic =
  'No se pudo completar la vinculación. Comprobá la autorización o iniciá un intento nuevo.';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function bindingPage(
  csrf: string,
  stage: 'start' | 'confirm' | 'pending' | 'error' | 'disabled',
  receipt?: string,
) {
  const code = `<label>Código privado<input name="code" type="password" required autocomplete="off" pattern="[a-f0-9]{64}" maxlength="64"></label>`;
  const hidden = `<input type="hidden" name="csrf" value="${escape(csrf)}">`;
  const cancel = `<form method="post" action="${cancelPath}">${hidden}<button class="secondary">Cancelar intento</button></form>`;
  const content =
    stage === 'start'
      ? `<p>Ingresá la autorización recibida por un canal privado. Google comprobará el control de tu cuenta; la vinculación requiere aprobación supervisada.</p><form method="post" action="${startPath}">${hidden}<label>Identificador de operación<input name="operationId" required autocomplete="off" maxlength="36" pattern="[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}"></label>${code}<button>Continuar con Google</button></form>`
      : stage === 'confirm'
        ? `<p>Google verificó la cuenta. Volvé a ingresar el código privado para presentar tu candidatura.</p><form method="post" action="${submitPath}">${hidden}${code}<button>Presentar candidatura</button></form>${cancel}`
        : stage === 'pending'
          ? `<p role="status">Candidatura pendiente de aprobación. Todavía no habilita acceso al CRM.</p>${receipt ? `<p>Compará esta huella con el operador por el canal acordado:</p><code>${escape(receipt)}</code>` : ''}<p><a href="${pagePath}">Volver al inicio</a></p>`
          : stage === 'disabled'
            ? '<p role="alert">La vinculación no está disponible en este entorno.</p>'
            : `<p role="alert">${generic}</p>${cancel}<p><a href="${pagePath}">Volver a intentar</a></p>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vinculación Google — PRISMA</title><style> :root{color-scheme:light;font-family:system-ui,sans-serif;color:#243746;background:#eef2f5}*{box-sizing:border-box}body{margin:0;padding:32px 16px}main{max-width:540px;margin:5vh auto;background:white;padding:32px;border-radius:16px;box-shadow:0 6px 24px #24374616}h1{font-size:1.6rem;line-height:1.2}p{line-height:1.6}label{display:grid;gap:8px;font-weight:600;margin:24px 0}input{width:100%;font:inherit;padding:12px;border:1px solid #758595;border-radius:8px;min-height:48px}button{font:inherit;font-weight:600;min-height:48px;padding:12px 16px;background:#254d64;color:white;border:0;border-radius:8px;width:100%;cursor:pointer}.secondary{background:#e5ebef;color:#243746;margin-top:12px}a{color:#234e70}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #b45f17;outline-offset:3px}code{display:block;overflow-wrap:anywhere;background:#eef2f5;padding:12px;border-radius:8px}small{color:#52616e}@media(max-width:480px){body{padding:16px 12px}main{padding:24px 20px;margin:2vh auto}}</style></head><body><main><small>PRISMA · Identidad institucional</small><h1>Vincular cuenta Google</h1>${content}</main></body></html>`;
}
const html = bindingPage;
export function bindingRouter(options?: BindingHttpOptions) {
  const router = Router();
  let core: ReturnType<typeof createGoogleOidc> | undefined;
  let origin = '';
  try {
    if (!options || !/^[a-f0-9]{64}$/.test(options.csrfKey) || !options.database) throw Error();
    core = createGoogleOidc(options.google, mysqlOidcStore(), options.transport);
    origin = new URL(options.google.redirectUri).origin;
    if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw Error();
  } catch {
    core = undefined;
  }
  const secure = process.env.NODE_ENV === 'production';
  const prefix = secure ? '__Host-prisma_binding' : 'prisma_binding';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: 300000,
  };
  const cookie = (req: Request, name: string) => {
    const values = (req.headers.cookie || '')
      .split(';')
      .map((x) => x.trim())
      .filter((x) => x.startsWith(name + '='));
    return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
  };
  const csrfFor = (secret: string) =>
    createHmac('sha256', Buffer.from(options!.csrfKey, 'hex'))
      .update('binding-csrf-v1:' + secret)
      .digest('hex');
  const token = (req: Request, res: Response) => {
    let secret = cookie(req, prefix + '_csrf');
    if (!secret || !validOpaque(secret)) {
      secret = opaque();
      res.cookie(prefix + '_csrf', secret, cookieOptions);
    }
    return csrfFor(secret);
  };
  const refCookie = (req: Request) => {
    const raw = cookie(req, prefix);
    if (!raw || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(raw)) throw Error();
    const [id, browserToken] = raw.split('.');
    return { id, browserToken };
  };
  const clear = (res: Response) => {
    res.clearCookie(prefix, cookieOptions);
    res.clearCookie(prefix + '_csrf', cookieOptions);
  };
  let ready: Promise<void> | undefined;
  const initialize = () =>
    (ready ??= (async () => {
      await bindingPreflight(options!.database);
      await bindingMaintenance();
    })());
  router.use((req, res, next) => {
    if (!paths.includes(req.path)) {
      const path = req.path.toLowerCase();
      if (path.startsWith('/api/auth/google') || path.startsWith('/vincular-google'))
        return res.status(404).json({ message: 'Ruta no encontrada.' });
      return next();
    }
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'",
    });
    if (!core) return res.status(503).type('html').send(html('', 'disabled'));
    initialize().then(
      () => next(),
      () => res.status(503).type('html').send(html('', 'disabled')),
    );
  });
  const limit = (count: number) =>
    rateLimit({
      windowMs: 900000,
      limit: count,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => ipKeyGenerator(req.socket.remoteAddress || 'unattributed-peer'),
      handler: (_req, res) => res.status(429).type('html').send(html('', 'error')),
    });
  const perOperation = rateLimit({
    windowMs: 900000,
    limit: 5,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.body?.operationId || 'invalid').slice(0, 36),
    handler: (_req, res) => res.status(429).type('html').send(html('', 'error')),
  });
  router.use(
    [startPath, submitPath, cancelPath],
    urlencoded({ extended: false, limit: '4kb', inflate: false, parameterLimit: 4 }),
  );
  router.use([startPath, submitPath, cancelPath], (req, res, next) => {
    try {
      if (req.method !== 'POST') return res.status(405).end();
      if (
        req.get('origin') !== origin ||
        (req.get('sec-fetch-site') && req.get('sec-fetch-site') !== 'same-origin')
      )
        throw Error();
      const secret = cookie(req, prefix + '_csrf'),
        actual = req.body?.csrf;
      if (
        !secret ||
        !validOpaque(secret) ||
        typeof actual !== 'string' ||
        !/^[a-f0-9]{64}$/.test(actual) ||
        !timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(csrfFor(secret), 'hex'))
      )
        throw Error();
      next();
    } catch {
      res
        .status(403)
        .type('html')
        .send(html(token(req, res), 'error'));
    }
  });
  router.get(pagePath, async (req, res) => {
    try {
      const csrf = token(req, res);
      if (cookie(req, prefix)) {
        const ref = refCookie(req),
          attempt = await bindingAttempt(ref.id, ref.browserToken);
        return res
          .type('html')
          .send(html(csrf, attempt.status === 'verified' ? 'confirm' : 'error'));
      }
      res.type('html').send(html(csrf, 'start'));
    } catch {
      clear(res);
      res
        .status(400)
        .type('html')
        .send(html(token(req, res), 'error'));
    }
  });
  const globalStarts = rateLimit({
    windowMs: 900000,
    limit: 50,
    keyGenerator: () => 'binding-starts',
    standardHeaders: false,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).type('html').send(html('', 'error')),
  });
  router.post(startPath, limit(10), globalStarts, perOperation, async (req, res) => {
    try {
      const body = z
        .object({
          operationId: z.string().uuid(),
          code: z.string().regex(/^[a-f0-9]{64}$/),
          csrf: z.string(),
        })
        .strict()
        .parse(req.body);
      const context = await bindingContext(body.operationId, body.code);
      if (cookie(req, prefix)) {
        const old = refCookie(req),
          attempt = await bindingAttempt(old.id, old.browserToken);
        await core!.invalidate(old.id, old.browserToken, attempt.context);
      }
      const started = await core!.begin(context, cookie(req, prefix + '_csrf')!);
      res.cookie(prefix, started.attemptId + '.' + started.browserToken, cookieOptions);
      // Rotate CSRF independently; it is not administrative authentication.
      // Correlation remains stable within this temporary browser flow; reset on completion/cancel.
      res.redirect(303, started.authorizationUrl);
    } catch {
      res
        .status(400)
        .type('html')
        .send(html(token(req, res), 'error'));
    }
  });
  let exchanging = 0;
  router.get(callbackPath, limit(30), async (req, res) => {
    let active = false;
    try {
      if (exchanging >= 2)
        return res
          .status(429)
          .type('html')
          .send(html(token(req, res), 'error'));
      const ref = refCookie(req);
      const separator = req.originalUrl.indexOf('?');
      const query = separator < 0 ? '' : req.originalUrl.slice(separator + 1);
      if (query.length > 8192) throw Error();
      const params = new URLSearchParams(query),
        states = params.getAll('state');
      if (states.length !== 1 || !validOpaque(states[0])) throw Error();
      // Reserve synchronously BEFORE the first await: concurrent correlation lookups
      // must not all pass the availability check and later exceed the exchange cap.
      exchanging++;
      active = true;
      const attempt = await bindingAttempt(ref.id, ref.browserToken, states[0]);
      await core!.complete(
        options!.google.redirectUri + '?' + query,
        ref.browserToken,
        attempt.context,
      );
      res.redirect(303, pagePath);
    } catch {
      res
        .status(400)
        .type('html')
        .send(html(token(req, res), 'error'));
    } finally {
      if (active) exchanging--;
    }
  });
  const service = browserBindings();
  router.post(submitPath, limit(10), async (req, res) => {
    try {
      const body = z
        .object({ code: z.string().regex(/^[a-f0-9]{64}$/), csrf: z.string() })
        .strict()
        .parse(req.body);
      const ref = refCookie(req),
        attempt = await bindingAttempt(ref.id, ref.browserToken);
      const fingerprint = await service.submitCandidate(
        attempt.context.operationId,
        attempt.context.userId,
        body.code,
        core!.evidenceReference(ref.id, ref.browserToken, attempt.context),
      );
      clear(res);
      res.type('html').send(html('', 'pending', fingerprint));
    } catch {
      res
        .status(400)
        .type('html')
        .send(html(token(req, res), 'error'));
    }
  });
  router.post(cancelPath, limit(10), async (req, res) => {
    try {
      z.object({ csrf: z.string() }).strict().parse(req.body);
      if (cookie(req, prefix)) {
        const ref = refCookie(req),
          attempt = await bindingAttempt(ref.id, ref.browserToken);
        await core!.invalidate(ref.id, ref.browserToken, attempt.context);
      }
      clear(res);
      res.redirect(303, pagePath);
    } catch {
      clear(res);
      res
        .status(400)
        .type('html')
        .send(html(token(req, res), 'error'));
    }
  });
  router.all(paths, (_req, res) => res.status(405).end());
  router.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
    void error;
    res.status(400).type('html').send(html('', 'error'));
  });
  return router;
}
export function bindingEnvironment(): BindingHttpOptions | undefined {
  try {
    if (process.env.BINDING_ENABLED !== 'true') return undefined;
    return {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: process.env.GOOGLE_REDIRECT_URI!,
        activeKeyId: process.env.OIDC_ACTIVE_KEY_ID!,
        keys: JSON.parse(process.env.OIDC_KEYS_JSON || 'null'),
      },
      csrfKey: process.env.BINDING_CSRF_KEY!,
      database: process.env.BINDING_DB_NAME!,
    };
  } catch {
    return undefined;
  }
}
export function startBindingMaintenance() {
  if (process.env.BINDING_ENABLED !== 'true') return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await bindingPreflight(process.env.BINDING_DB_NAME || '');
      await bindingMaintenance();
    } catch {
      console.error('Binding maintenance unavailable.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void run(), 600000);
  timer.unref();
  return () => clearInterval(timer);
}
