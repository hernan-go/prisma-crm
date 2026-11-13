import { Router, type RequestHandler } from 'express';
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { query, execute } from './db.js';
import { createProxyDiagnostics } from './proxy-diagnostics.js';
import { authenticateIdentitySession, revokePresentedIdentitySession } from './identity.js';
export type Principal =
  { kind: 'identity'; userId: string; displayName: string; roles: string[] } | { kind: 'legacy' };
const lifetime = 8 * 60 * 60 * 1000;
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string) {
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return false;
  const [, salt, key] = hash.split(':');
  return timingSafeEqual(await derive(password, salt), Buffer.from(key, 'hex'));
}
export interface SessionStore {
  get: (key: string) => Promise<number | undefined>;
  set: (key: string, expires: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}
const mysqlStore: SessionStore = {
  async get(key) {
    return (await query('SELECT expires_at FROM admin_sessions WHERE token_hash=?', [key]))[0]
      ?.expires_at;
  },
  async set(key, expires) {
    await execute('DELETE FROM admin_sessions WHERE expires_at<?', [Date.now()]);
    await execute('INSERT INTO admin_sessions(token_hash,expires_at) VALUES (?,?)', [key, expires]);
  },
  async delete(key) {
    await execute('DELETE FROM admin_sessions WHERE token_hash=?', [key]);
  },
};
export type AuthOptions = {
  hash?: string;
  secret?: string;
  store?: SessionStore;
  identityEnabled?: boolean;
};
export function authentication(options: AuthOptions = {}) {
  const hash = options.hash ?? process.env.ADMIN_PASSWORD_HASH ?? '';
  const secret = options.secret ?? process.env.SESSION_SECRET ?? '';
  const configured = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) && secret.length >= 64;
  const store = options.store || mysqlStore;
  const identityEnabled = options.identityEnabled === true;
  const router = Router();
  const observeProxy = createProxyDiagnostics();
  const cookieName = () =>
    process.env.NODE_ENV === 'production' ? '__Host-prisma_admin' : 'prisma_admin';
  const cookieOptions = () => ({
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  const legacyKey = (token: string | undefined) =>
    token && /^[a-f0-9]{64}$/.test(token)
      ? createHmac('sha256', secret)
          .update(hash + token)
          .digest('hex')
      : undefined;
  const keyFor = (req: Parameters<RequestHandler>[0]) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName()}=`))
      ?.slice(cookieName().length + 1);
    return legacyKey(token);
  };
  const valid = async (req: Parameters<RequestHandler>[0]) => {
    const key = keyFor(req);
    if (!configured || !key) return false;
    return Number(await store.get(key)) > Date.now();
  };
  const values = (req: Parameters<RequestHandler>[0], name: string) =>
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim())
      .filter((c) => c.startsWith(name + '='))
      .map((c) => c.slice(name.length + 1));
  const identityName = () =>
    process.env.NODE_ENV === 'production' ? '__Host-prisma_identity' : 'prisma_identity';
  const identityCookies = (req: Parameters<RequestHandler>[0]) => values(req, identityName());
  const methodConflict = { message: 'Cerrá la sesión antes de cambiar de método o cuenta.' };
  const resolve = async (
    req: Parameters<RequestHandler>[0],
  ): Promise<{
    principal?: Principal;
    expiresAt?: number;
    status?: number;
  }> => {
    const cookies = identityCookies(req);
    if (identityEnabled && cookies.length) {
      if (values(req, cookieName()).length) return { status: 409 };
      if (cookies.length !== 1) return { status: 401 };
      const user = await authenticateIdentitySession(cookies[0], 'crm', {
        requireInstitution: true,
      });
      return user
        ? {
            principal: {
              kind: 'identity',
              userId: user.id,
              displayName: user.display_name,
              roles: user.roles,
            },
            expiresAt: user.expiresAt,
          }
        : { status: 401 };
    }
    if (!configured) return { status: 503 };
    return (await valid(req)) ? { principal: { kind: 'legacy' } } : { status: 401 };
  };
  const guard: RequestHandler = async (req, res, next) => {
    try {
      const state = await resolve(req);
      if (!state.principal) {
        res
          .status(state.status || 401)
          .json(
            state.status === 409
              ? methodConflict
              : {
                  message:
                    state.status === 503
                      ? 'Acceso administrativo no disponible.'
                      : 'Ingresá para acceder al CRM.',
                },
          );
        return;
      }
      res.locals.principal = state.principal;
      next();
    } catch {
      res.status(503).json({ message: 'Acceso administrativo temporalmente no disponible.' });
    }
  };
  router.get('/session', async (req, res) => {
    let state: Awaited<ReturnType<typeof resolve>>;
    try {
      state = await resolve(req);
    } catch {
      state = { status: 503 };
    }
    const authenticated = !!state.principal;
    if (authenticated) observeProxy(req);
    if (
      identityEnabled &&
      (state.status === 409 ||
        (state.status === 503 && (configured || identityCookies(req).length)))
    )
      res.status(state.status);
    res.json({
      authenticated,
      configured,
      ...(identityEnabled
        ? {
            method: state.principal?.kind ?? null,
            identity:
              state.principal?.kind === 'identity'
                ? {
                    userId: state.principal.userId,
                    displayName: state.principal.displayName,
                    roles: state.principal.roles,
                  }
                : null,
            expiresAt: state.expiresAt ?? null,
            legacy: { available: configured },
            status: authenticated
              ? 'authenticated'
              : state.status === 409
                ? 'conflict'
                : state.status === 503 && (configured || identityCookies(req).length)
                  ? 'unavailable'
                  : identityCookies(req).length || values(req, cookieName()).length
                    ? 'invalid'
                    : 'anonymous',
          }
        : {}),
      ...(res.locals.googleLogin ? { googleLogin: res.locals.googleLogin } : {}),
    });
  });
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Demasiados intentos de acceso. Esperá 15 minutos.' },
  });
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    keyGenerator: () => 'admin-login',
    standardHeaders: false,
    legacyHeaders: false,
    message: { message: 'Acceso temporalmente limitado. Esperá 15 minutos.' },
  });
  router.post('/login', limiter, globalLimiter, async (req, res) => {
    const loginName =
      process.env.NODE_ENV === 'production' ? '__Host-prisma_login' : 'prisma_login';
    if (identityEnabled && (identityCookies(req).length || values(req, loginName).length)) {
      res.status(409).json(methodConflict);
      return;
    }
    if (!configured) {
      res.status(503).json({ message: 'Falta configurar el acceso administrativo.' });
      return;
    }
    const { password } = z.object({ password: z.string().min(1).max(1024) }).parse(req.body);
    if (!(await verifyPassword(password, hash))) {
      res.status(401).json({ message: 'Contraseña incorrecta.' });
      return;
    }
    const old = keyFor(req);
    if (old) await store.delete(old);
    const token = randomBytes(32).toString('hex');
    await store.set(
      createHmac('sha256', secret)
        .update(hash + token)
        .digest('hex'),
      Date.now() + lifetime,
    );
    res.cookie(cookieName(), token, { ...cookieOptions(), maxAge: lifetime });
    res.json({ ok: true });
  });
  router.post('/logout', async (req, res) => {
    const keys = values(req, cookieName())
      .map(legacyKey)
      .filter((key): key is string => !!key);
    // Attempt both revocations even if one authority is unavailable. Preserve cookies
    // on failure so a retry can still identify any remaining server credential.
    const results = await Promise.allSettled([
      ...identityCookies(req).map((token) => revokePresentedIdentitySession(token)),
      ...keys.map((key) => store.delete(key)),
      ...(res.locals.cancelGoogleLogin ? [res.locals.cancelGoogleLogin()] : []),
    ]);
    if (results.some((result) => result.status === 'rejected')) {
      res.status(503).json({ message: 'No se pudo cerrar la sesión. Intentá nuevamente.' });
      return;
    }
    res.clearCookie(cookieName(), cookieOptions());
    res.clearCookie(identityName(), cookieOptions());
    res.locals.clearGoogleLogin?.();
    res.json({ ok: true });
  });
  return { router, guard, configured };
}
