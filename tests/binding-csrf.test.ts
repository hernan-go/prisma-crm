import { expect, it } from 'vitest';
import { createBindingCsrf, bindingCsrfLifetime } from '../server/binding-csrf';
const key = 'cd'.repeat(32);
function setup() {
  let time = 1000000;
  const csrf = createBindingCsrf(key, () => time);
  const minted = csrf.issue();
  return {
    csrf,
    minted,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
it('binds a signed form to a single cookie and a five-minute absolute deadline', () => {
  const { csrf, minted, advance } = setup();
  expect(bindingCsrfLifetime).toBe(300000);
  expect(csrf.reject([minted.cookie], minted.token)).toBeNull();
  advance(299999);
  expect(csrf.reject([minted.cookie], minted.token)).toBeNull();
  advance(1);
  expect(csrf.reject([minted.cookie], minted.token)).toBe('csrf_expired');
});
it('recognizes expiry from a genuine form even after the browser removes its cookie', () => {
  const { csrf, minted, advance } = setup();
  expect(csrf.reject([], minted.token)).toBe('csrf_cookie_missing');
  advance(300000);
  expect(csrf.reject([], minted.token)).toBe('csrf_expired');
});
it('does not extend an existing cookie when another form is rendered', () => {
  const { csrf, minted, advance } = setup();
  advance(299999);
  expect(csrf.issue(minted.cookie)).toMatchObject({
    cookie: minted.cookie,
    token: minted.token,
    replaceCookie: false,
  });
  advance(1);
  const fresh = csrf.issue(minted.cookie);
  expect(fresh.replaceCookie).toBe(true);
  expect(csrf.reject([fresh.cookie], fresh.token)).toBeNull();
  expect(csrf.reject([fresh.cookie], minted.token)).toBe('csrf_expired');
});
it('explicit recovery replaces the context and rejects old forms without extending the TTL', () => {
  const { csrf, minted, advance } = setup();
  advance(1000);
  const fresh = csrf.issue(undefined);
  expect(fresh.replaceCookie).toBe(true);
  expect(fresh.cookie).not.toBe(minted.cookie);
  expect(csrf.reject([fresh.cookie], minted.token)).toBe('csrf_token_mismatch');
  advance(300000);
  expect(csrf.reject([fresh.cookie], fresh.token)).toBe('csrf_expired');
});
it('distinguishes ambiguous, malformed, missing and mismatched credentials', () => {
  const { csrf, minted } = setup();
  const other = csrf.issue();
  expect(csrf.reject([minted.cookie, minted.cookie], minted.token)).toBe('csrf_cookie_duplicate');
  expect(csrf.reject(['invalid'], minted.token)).toBe('csrf_cookie_invalid');
  expect(csrf.reject([minted.cookie], undefined)).toBe('csrf_token_missing');
  expect(csrf.reject([minted.cookie], 'a'.repeat(64))).toBe('csrf_token_invalid');
  expect(csrf.reject([other.cookie], minted.token)).toBe('csrf_token_mismatch');
});
it('rejects forged time/signatures and cross-key forms instead of trusting expiry hints', () => {
  const { csrf, minted } = setup();
  const parts = minted.token.split('.');
  parts[1] = '1';
  expect(csrf.reject([], parts.join('.'))).toBe('csrf_token_invalid');
  expect(
    createBindingCsrf('ab'.repeat(32), () => 1000000).reject([minted.cookie], minted.token),
  ).toBe('csrf_token_invalid');
  const future = createBindingCsrf(key, () => 1100000).issue();
  expect(csrf.reject([future.cookie], future.token)).toBe('csrf_cookie_invalid');
  expect(csrf.reject([minted.cookie], future.token)).toBe('csrf_token_invalid');
});
it('exposes only the original opaque browser correlation to the existing OAuth core', () => {
  const { csrf, minted } = setup();
  expect(csrf.browserToken(minted.cookie)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(csrf.browserToken('legacy-cookie')).toBeUndefined();
});
