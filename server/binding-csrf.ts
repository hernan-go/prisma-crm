import { createHmac, timingSafeEqual } from 'node:crypto';
import { opaque } from './oidc-crypto.js';
export const bindingCsrfLifetime = 300000;
export type BindingCsrfRejection =
  | 'csrf_cookie_missing'
  | 'csrf_cookie_duplicate'
  | 'csrf_cookie_invalid'
  | 'csrf_expired'
  | 'csrf_token_missing'
  | 'csrf_token_invalid'
  | 'csrf_token_mismatch';
const cookiePattern = /^v1\.(\d{1,16})\.([A-Za-z0-9_-]{43})$/;
const tokenPattern = /^v1\.(\d{1,16})\.([a-f0-9]{64})\.([a-f0-9]{64})$/;
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
// A separately signed form envelope proves its original deadline even when the
// browser has already discarded the HttpOnly cookie. It never replaces that cookie.
export function createBindingCsrf(key: string, now = () => Date.now()) {
  const sign = (purpose: string, value: string) =>
    createHmac('sha256', Buffer.from(key, 'hex'))
      .update(JSON.stringify([purpose, value]))
      .digest('hex');
  const cookieData = (raw: string) => {
    const m = cookiePattern.exec(raw);
    if (!m) return undefined;
    const issued = Number(m[1]);
    if (!Number.isSafeInteger(issued) || issued < 0 || issued > now()) return undefined;
    return { issued, secret: m[2] };
  };
  const tokenFor = (raw: string, issued: number) => {
    const binding = sign('binding-csrf-cookie-v2', raw);
    const body = String(issued) + '.' + binding;
    return 'v1.' + body + '.' + sign('binding-csrf-form-v2', body);
  };
  return {
    issue(existing?: string) {
      const data = existing ? cookieData(existing) : undefined;
      if (existing && data && now() - data.issued < bindingCsrfLifetime)
        return { cookie: existing, token: tokenFor(existing, data.issued), replaceCookie: false };
      const issued = now(),
        cookie = 'v1.' + issued + '.' + opaque();
      return { cookie, token: tokenFor(cookie, issued), replaceCookie: true };
    },
    browserToken(raw: string) {
      return cookieData(raw)?.secret;
    },
    reject(cookies: string[], token: unknown): BindingCsrfRejection | null {
      if (cookies.length > 1) return 'csrf_cookie_duplicate';
      if (cookies.length === 1 && !cookieData(cookies[0])) return 'csrf_cookie_invalid';
      if (token === undefined || token === null || token === '') return 'csrf_token_missing';
      const m = typeof token === 'string' ? tokenPattern.exec(token) : null;
      if (!m) return 'csrf_token_invalid';
      const issued = Number(m[1]),
        body = m[1] + '.' + m[2];
      if (
        !Number.isSafeInteger(issued) ||
        issued < 0 ||
        issued > now() ||
        !equal(m[3], sign('binding-csrf-form-v2', body))
      )
        return 'csrf_token_invalid';
      if (now() - issued >= bindingCsrfLifetime) return 'csrf_expired';
      if (!cookies.length) return 'csrf_cookie_missing';
      const data = cookieData(cookies[0])!;
      if (now() - data.issued >= bindingCsrfLifetime) return 'csrf_expired';
      if (data.issued !== issued || !equal(m[2], sign('binding-csrf-cookie-v2', cookies[0])))
        return 'csrf_token_mismatch';
      return null;
    },
  };
}
