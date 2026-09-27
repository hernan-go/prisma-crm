import { randomBytes } from 'node:crypto';
import { hashPassword, type SessionStore } from '../server/auth.js';
export async function testCredentials() {
  const password = randomBytes(24).toString('hex');
  return { password, hash: await hashPassword(password), secret: randomBytes(48).toString('hex') };
}
export function memorySessions(): SessionStore {
  const sessions = new Map<string, number>();
  return {
    async get(k) {
      return sessions.get(k);
    },
    async set(k, e) {
      sessions.set(k, e);
    },
    async delete(k) {
      sessions.delete(k);
    },
  };
}
