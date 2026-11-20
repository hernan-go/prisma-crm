import type { PortalSession } from './contracts';
export class PortalError extends Error {
  constructor(public readonly status: number) {
    super('No se pudo completar la solicitud.');
  }
}
async function request(path: string, csrf?: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch('/api/portal/auth/' + path, {
      method: csrf === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      ...(csrf === undefined ? {} : { headers: { 'X-Portal-CSRF': csrf } }),
    });
  } catch {
    throw new PortalError(0);
  }
  if (!response.ok) throw new PortalError(response.status);
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
    return body as Record<string, unknown>;
  } catch {
    throw new PortalError(0);
  }
}
function csrfValue(data: Record<string, unknown>) {
  if (typeof data.csrf !== 'string' || !data.csrf) throw new PortalError(0);
  return data.csrf;
}
export const portalClient = {
  async session(): Promise<PortalSession> {
    const data = await request('session');
    if (data.authenticated === false) return { authenticated: false, csrf: csrfValue(data) };
    const identity = data.identity as Record<string, unknown> | undefined;
    if (
      data.authenticated !== true ||
      !identity ||
      typeof identity.displayName !== 'string' ||
      !identity.displayName.trim() ||
      identity.context !== 'facilitator' ||
      typeof data.expiresAt !== 'number' ||
      !Number.isFinite(data.expiresAt)
    )
      throw new PortalError(0);
    return {
      authenticated: true,
      identity: { displayName: identity.displayName, context: 'facilitator' },
      expiresAt: data.expiresAt,
    };
  },
  async start(csrf: string) {
    const data = await request('google/start', csrf);
    if (typeof data.authorizationUrl !== 'string') throw new PortalError(0);
    let url: URL;
    try {
      url = new URL(data.authorizationUrl);
    } catch {
      throw new PortalError(0);
    }
    if (
      url.origin !== 'https://accounts.google.com' ||
      url.pathname !== '/o/oauth2/v2/auth' ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new PortalError(0);
    return url.href;
  },
  async logout() {
    const data = await request('logout-csrf');
    const result = await request('logout', csrfValue(data));
    if (result.authenticated !== false) throw new PortalError(0);
  },
};
