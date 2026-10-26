import type { Request } from 'express';
import { isIP } from 'node:net';
import { TLSSocket } from 'node:tls';

const probes = new Set(['baseline', 'proto-http', 'proto-chain']);
const protocols = new Set(['http', 'https', 'http,https', 'https,http']);
const lifetimeMs = 10 * 60 * 1000;
const maximumRecords = 12;

// Server logs only. The existing session handler calls this AFTER validating the
// administrator's session. Never add it to a public route or log arbitrary headers.
export function createProxyDiagnostics(
  options: {
    enabled?: boolean;
    now?: () => number;
    log?: (record: Record<string, unknown>) => void;
  } = {},
) {
  const enabled = options.enabled ?? process.env.PROXY_DIAGNOSTICS === 'true';
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const log = options.log ?? ((record) => console.info(JSON.stringify(record)));
  let remaining = maximumRecords;
  return (req: Request) => {
    if (!enabled || req.method !== 'GET' || remaining === 0 || now() - startedAt >= lifetimeMs)
      return;
    const probe = req.get('x-proxy-check');
    if (!probe || !probes.has(probe)) return;
    let expectedHost: string | undefined;
    try {
      expectedHost = new URL(process.env.APP_URL || 'http://localhost:5173').host;
    } catch {
      /* Report only a boolean, never an environment value or raw Host. */
    }
    const forwarded = req.get('x-forwarded-proto');
    const normalized = forwarded
      ?.split(',')
      .map((v) => v.trim().toLowerCase())
      .join(',');
    const nodeEnv = process.env.NODE_ENV;
    const trustProxy: unknown = req.app.get('trust proxy');
    const peer = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const record = {
      event: 'proxy_diagnostic',
      probe,
      socket_peer: isIP(peer) ? peer : 'unavailable',
      socket_local_port: req.socket.localPort ?? null,
      socket_tls: req.socket instanceof TLSSocket && req.socket.encrypted === true,
      forwarded_proto:
        forwarded === undefined
          ? 'missing'
          : normalized && protocols.has(normalized)
            ? normalized
            : 'other',
      forwarded_proto_exact_https: forwarded === 'https',
      express_protocol: ['http', 'https'].includes(req.protocol) ? req.protocol : 'other',
      express_secure: req.secure,
      trust_proxy_hops:
        typeof trustProxy === 'number' && Number.isFinite(trustProxy) ? trustProxy : 'custom',
      node_env:
        nodeEnv && ['production', 'development', 'test'].includes(nodeEnv) ? nodeEnv : 'other',
      host_matches_app_url: expectedHost !== undefined && req.get('host') === expectedHost,
    };
    remaining--;
    try {
      log(record);
    } catch {
      /* Diagnostics must not change authentication or its response. */
    }
  };
}
