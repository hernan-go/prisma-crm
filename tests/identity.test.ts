import { expect, it, afterAll } from 'vitest';
import { pool } from '../server/db';
import { permits, sessionDigest } from '../server/identity';
afterAll(() => pool.end());
it('deniega estados y roles insuficientes, admite múltiples roles explícitos', () => {
  const user = {
    id: 'test',
    display_name: 'Synthetic',
    status: 'enabled' as const,
    roles: ['admin', 'facilitator'] as ('admin' | 'facilitator')[],
  };
  expect(permits(user, 'admin')).toBe(true);
  expect(permits(user, 'participant')).toBe(false);
  expect(permits({ ...user, status: 'disabled' }, 'admin')).toBe(false);
});
it('rechaza tokens malformados y representa tokens mediante un hash irreversible', () => {
  expect(sessionDigest('bad')).toBeUndefined();
  expect(sessionDigest('a'.repeat(64))).toMatch(/^[a-f0-9]{64}$/);
  expect(sessionDigest('a'.repeat(64))).not.toBe('a'.repeat(64));
  expect(sessionDigest('a'.repeat(64))).not.toBe(sessionDigest('b'.repeat(64)));
});
