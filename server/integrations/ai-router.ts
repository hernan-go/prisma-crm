import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { TLSSocket } from 'node:tls';
import { rateLimit } from 'express-rate-limit';
import { monthlyContextQuerySchema, monthlyContextSchema } from '../../shared/ai-context.js';
import { AppError } from '../errors.js';
import { monthlyContext } from './ai-context.js';

export interface AiIntegrationOptions {
  tokenHash?: string;
  publicOrigin?: string;
  trustedProxyIps?: string;
  allowLocalHttp?: boolean;
  read?: typeof monthlyContext;
}
const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '');
const loopback = (ip: string) => ['127.0.0.1', '::1'].includes(normalizeIp(ip));

export function aiIntegration(options: AiIntegrationOptions = {}) {
  const router = Router();
  const production = process.env.NODE_ENV === 'production';
  const tokenHash = options.tokenHash ?? process.env.AI_READ_TOKEN_SHA256 ?? '';
  const publicOrigin = options.publicOrigin ?? process.env.AI_READ_PUBLIC_ORIGIN ?? '';
  const proxyConfig = options.trustedProxyIps ?? process.env.AI_READ_TRUSTED_PROXY_IPS ?? '';
  const proxies = proxyConfig ? proxyConfig.split(',').map((ip) => normalizeIp(ip.trim())) : [];
  const allowLocal =
    !production && (options.allowLocalHttp ?? process.env.AI_READ_ALLOW_LOCAL_HTTP === 'true');
  let origin: URL | undefined;
  try {
    const parsed = new URL(publicOrigin);
    if (
      parsed.protocol === 'https:' &&
      parsed.origin === publicOrigin &&
      !parsed.username &&
      !parsed.password
    )
      origin = parsed;
  } catch {
    /* Missing or invalid public origin fails closed outside explicit local mode. */
  }
  const configured =
    /^[a-f0-9]{64}$/.test(tokenHash) &&
    (origin || allowLocal) &&
    proxies.every((ip) => isIP(ip)) &&
    proxies.length <= 10;
  const read = options.read ?? monthlyContext;
  let inFlight = 0;
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });
  // Constant keys bound memory and prevent spoofed forwarding headers from bypassing limits.
  // Limits are intentionally shared by this single service credential, per Node process.
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      keyGenerator: () => 'ai-read-ingress',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'rate_limited', message: 'Demasiadas solicitudes.' },
    }),
  );
  router.use((req, res, next) => {
    if (!configured)
      return res
        .status(503)
        .json({ code: 'not_configured', message: 'Integración no disponible.' });
    const peer = normalizeIp(req.socket.remoteAddress ?? '');
    const directTls = req.socket instanceof TLSSocket && req.socket.encrypted;
    const proxiedTls = proxies.includes(peer) && req.get('x-forwarded-proto') === 'https';
    const secure = origin && req.get('host') === origin.host && (directTls || proxiedTls);
    const local =
      allowLocal &&
      loopback(peer) &&
      /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.get('host') ?? '');
    // Do not use req.secure: the administrative app's numeric trust-proxy setting is independent.
    if (!secure && !local)
      return res.status(403).json({ code: 'https_required', message: 'Transporte no permitido.' });
    if (req.get('origin') || req.get('sec-fetch-site'))
      return res
        .status(403)
        .json({ code: 'service_only', message: 'Acceso exclusivo de servicio.' });
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization);
    const digest = createHash('sha256')
      .update(match?.[1] ?? '')
      .digest();
    if (!match || !timingSafeEqual(digest, Buffer.from(tokenHash, 'hex'))) {
      res.set('WWW-Authenticate', 'Bearer realm="monthly-context"');
      return res.status(401).json({ code: 'unauthorized', message: 'Credencial no válida.' });
    }
    if (req.method !== 'GET') {
      res.set('Allow', 'GET');
      return res.status(405).json({ code: 'read_only', message: 'Solo lectura.' });
    }
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 30,
      keyGenerator: () => 'ai-read-authorized',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { code: 'rate_limited', message: 'Demasiadas consultas.' },
    }),
  );
  router.get('/monthly-context', async (req, res) => {
    const parsed = monthlyContextQuerySchema.safeParse(req.query);
    if (
      !parsed.success ||
      req.headers['transfer-encoding'] ||
      Number(req.headers['content-length'] ?? 0) > 0
    )
      return res
        .status(422)
        .json({ code: 'invalid_request', message: 'Usá únicamente period=AAAA-MM, sin cuerpo.' });
    if (inFlight >= 2) return res.status(503).json({ code: 'busy', message: 'Servicio ocupado.' });
    inFlight++;
    try {
      const data = monthlyContextSchema.parse(await read(parsed.data.period));
      const json = JSON.stringify(data);
      if (Buffer.byteLength(json) > 512 * 1024)
        throw new AppError(413, 'Contexto demasiado extenso.');
      return res.type('application/json').send(json);
    } catch (error) {
      if (error instanceof AppError && error.status === 404)
        return res.status(404).json({ code: 'period_not_found', message: 'Período inexistente.' });
      if (error instanceof AppError && error.status === 413)
        return res
          .status(413)
          .json({ code: 'context_too_large', message: 'Contexto demasiado extenso.' });
      // Do not log SQL, query parameters, credentials or underlying error messages.
      return res
        .status(503)
        .json({ code: 'context_unavailable', message: 'No se pudo consultar el contexto.' });
    } finally {
      inFlight--;
    }
  });
  router.use((_req, res) =>
    res.status(404).json({ code: 'not_found', message: 'Ruta no encontrada.' }),
  );
  return router;
}
