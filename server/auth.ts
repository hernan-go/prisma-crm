import { Router, type RequestHandler } from 'express';
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { query, execute } from './db.js';
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
export type AuthOptions = { hash?: string; secret?: string; store?: SessionStore };
export function authentication(options: AuthOptions = {}) {
  const hash = options.hash ?? process.env.ADMIN_PASSWORD_HASH ?? '';
  const secret = options.secret ?? process.env.SESSION_SECRET ?? '';
  const configured = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash) && secret.length >= 64;
  const store = options.store || mysqlStore;
  const router = Router();
  const cookieName = () =>
    process.env.NODE_ENV === 'production' ? '__Host-prisma_admin' : 'prisma_admin';
  const cookieOptions = () => ({
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  const keyFor = (req: Parameters<RequestHandler>[0]) => {
    const token = (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName()}=`))
      ?.slice(cookieName().length + 1);
    return token && /^[a-f0-9]{64}$/.test(token)
      ? createHmac('sha256', secret)
          .update(hash + token)
          .digest('hex')
      : undefined;
  };
  const valid = async (req: Parameters<RequestHandler>[0]) => {
    const key = keyFor(req);
    if (!configured || !key) return false;
    return Number(await store.get(key)) > Date.now();
  };
  const guard: RequestHandler = async (req, res, next) => {
    if (!configured) {
      res
        .status(503)
        .json({
          message: 'Configurá ADMIN_PASSWORD_HASH y SESSION_SECRET para habilitar el acceso.',
        });
      return;
    }
    if (!(await valid(req))) {
      res.status(401).json({ message: 'Ingresá para acceder al CRM.' });
      return;
    }
    next();
  };
  router.get('/session', async (req, res) =>
    res.json({ authenticated: await valid(req), configured }),
  );
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
    const key = keyFor(req);
    if (key) await store.delete(key);
    res.clearCookie(cookieName(), cookieOptions());
    res.json({ ok: true });
  });
  return { router, guard, configured };
}
