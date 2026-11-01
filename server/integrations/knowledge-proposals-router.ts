import express, { Router, type ErrorRequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { TLSSocket } from 'node:tls';
import { rateLimit } from 'express-rate-limit';
import { ZodError, z } from 'zod';
import { AppError } from '../errors.js';
import { receiveProposal, proposalStatus, sha256 } from '../knowledge-proposals.js';

export interface ProposalIntegrationOptions {
  tokenHash?: string;
  readTokenHash?: string;
  publicOrigin?: string;
  trustedProxyIps?: string;
  transportMode?: string;
  allowLocalHttp?: boolean;
  receive?: typeof receiveProposal;
  status?: typeof proposalStatus;
}
export function proposalIntegration(options: ProposalIntegrationOptions = {}) {
  const router = Router();
  const production = process.env.NODE_ENV === 'production';
  const hash = options.tokenHash ?? process.env.AI_PROPOSAL_TOKEN_SHA256 ?? '';
  const readHash = options.readTokenHash ?? process.env.AI_READ_TOKEN_SHA256 ?? '';
  const publicOrigin = options.publicOrigin ?? process.env.AI_READ_PUBLIC_ORIGIN ?? '';
  const mode = options.transportMode ?? process.env.AI_READ_TRANSPORT_MODE ?? 'verified_peer';
  const normalize = (ip: string) => ip.replace(/^::ffff:/, '');
  const proxies = (options.trustedProxyIps ?? process.env.AI_READ_TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .filter(Boolean)
    .map((ip) => normalize(ip.trim()));
  const localAllowed =
    !production && (options.allowLocalHttp ?? process.env.AI_READ_ALLOW_LOCAL_HTTP === 'true');
  let origin: URL | undefined;
  try {
    const url = new URL(publicOrigin);
    if (url.protocol === 'https:' && url.origin === publicOrigin && !url.username && !url.password)
      origin = url;
  } catch {
    /* fail closed */
  }
  const managed = mode === 'siteground_managed';
  const configured =
    /^[a-f0-9]{64}$/.test(hash) &&
    hash !== readHash &&
    ['verified_peer', 'siteground_managed'].includes(mode) &&
    (!managed || (production && !!origin)) &&
    (origin || localAllowed) &&
    proxies.length <= 10 &&
    proxies.every((ip) => isIP(ip));
  let inFlight = 0;
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 60,
      keyGenerator: () => 'proposal-ingress',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  router.use((req, res, next) => {
    if (!configured)
      return res.status(503).json({ message: 'Recepción de propuestas no configurada.' });
    const raw = req.socket.remoteAddress;
    const peer = normalize(raw ?? '');
    const proxied = proxies.includes(peer) && req.get('x-forwarded-proto') === 'https';
    // Same explicitly configured SiteGround trust assumption as the read API:
    // hosting must isolate Node and overwrite forwarding headers.
    const secure =
      origin &&
      req.get('host') === origin.host &&
      (managed
        ? (raw === undefined || (isIP(peer) !== 0 && proxies.includes(peer))) &&
          req.get('x-forwarded-proto') === 'https'
        : (req.socket instanceof TLSSocket && req.socket.encrypted) || proxied);
    const local =
      localAllowed &&
      ['127.0.0.1', '::1'].includes(peer) &&
      /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.get('host') ?? '');
    if (!secure && !local) return res.status(403).json({ message: 'Transporte no permitido.' });
    if (
      [
        'origin',
        'cookie',
        'referer',
        'sec-fetch-site',
        'sec-fetch-mode',
        'sec-fetch-dest',
        'sec-fetch-user',
      ].some((h) => req.headers[h] !== undefined)
    )
      return res.status(403).json({ message: 'Acceso exclusivo de servicio.' });
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') ?? '');
    if (
      !match ||
      !timingSafeEqual(Buffer.from(sha256(match[1]), 'hex'), Buffer.from(hash, 'hex'))
    ) {
      res.set('WWW-Authenticate', 'Bearer realm="knowledge-proposals"');
      return res.status(401).json({ message: 'Credencial no válida.' });
    }
    if (req.method !== 'GET' && req.method !== 'POST')
      return res.status(405).set('Allow', 'GET, POST').json({ message: 'Método no permitido.' });
    next();
  });
  router.use(
    rateLimit({
      windowMs: 60000,
      limit: 20,
      keyGenerator: () => 'proposal-authorized',
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  router.use((req, res, next) => {
    if (inFlight >= 2) return res.status(503).json({ message: 'Servicio ocupado.' });
    inFlight++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlight--;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  });
  // JSON escaping can expand 512 KiB of valid Markdown by up to six times.
  router.use(express.json({ limit: '4mb', strict: true, inflate: false }));
  router.post('/', async (req, res) => {
    z.object({}).strict().parse(req.query);
    if (!req.is('application/json')) throw new AppError(415, 'Se requiere JSON.');
    res.json(await (options.receive ?? receiveProposal)(req.body));
  });
  router.get('/:id', async (req, res) => {
    z.object({}).strict().parse(req.query);
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) > 0)
      throw new AppError(422, 'Consulta sin cuerpo.');
    res.json(await (options.status ?? proposalStatus)(String(req.params.id)));
  });
  router.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof ZodError
        ? 422
        : error instanceof AppError
          ? error.status
          : error?.type === 'entity.too.large'
            ? 413
            : error?.type === 'encoding.unsupported'
              ? 415
              : error?.type === 'entity.parse.failed'
                ? 400
                : 503;
    res
      .status(status)
      .json({
        message:
          error instanceof AppError
            ? error.message
            : status === 503
              ? 'Servicio no disponible.'
              : 'Solicitud inválida.',
      });
  };
  router.use(errors);
  return router;
}
