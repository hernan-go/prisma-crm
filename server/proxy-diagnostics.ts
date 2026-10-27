import type { Application, Request } from 'express';
import { isIP } from 'node:net';
import { TLSSocket } from 'node:tls';
import { createPrivateDiagnosticLog } from './proxy-diagnostic-file.js';

const probes = new Set(['baseline', 'proto-http', 'proto-chain']);
const protocols = new Set(['http', 'https', 'http,https', 'https,http']);
const lifetimeMs = 10 * 60 * 1000;
const maximumRecords = 12;
const diagnosticServers = new WeakMap<Application, { address(): unknown }>();

// Register the actual server returned by this application's listen(), not an
// address inferred from headers, HOST/PORT or missing socket peer metadata.
export function registerProxyDiagnosticServer(app: Application, server: { address(): unknown }) {
  diagnosticServers.set(app, server);
}

export function classifyServerAddress(
  address: unknown,
  platform: string = process.platform,
): 'tcp' | 'unix' | 'unknown' {
  // On Windows a string denotes a named pipe, not a Unix socket.
  if (typeof address === 'string')
    return address.length > 0 && platform !== 'win32' ? 'unix' : 'unknown';
  if (
    address &&
    typeof address === 'object' &&
    'address' in address &&
    typeof address.address === 'string' &&
    'family' in address &&
    ((address.family === 'IPv4' && isIP(address.address) === 4) ||
      (address.family === 'IPv6' && isIP(address.address) === 6)) &&
    'port' in address &&
    typeof address.port === 'number' &&
    Number.isInteger(address.port) &&
    address.port > 0 &&
    address.port <= 65535
  )
    return 'tcp';
  return 'unknown';
}

function serverTransport(app: Application): 'tcp' | 'unix' | 'unknown' {
  try {
    return classifyServerAddress(diagnosticServers.get(app)?.address());
  } catch {
    // A runtime adapter may not expose address(). Never leak its exception or
    // infer a trusted transport from absence of TCP metadata.
    return 'unknown';
  }
}

// Private file only. The existing session handler calls this AFTER validating the
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
  const log = options.log ?? createPrivateDiagnosticLog();
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
      server_transport: serverTransport(req.app),
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
