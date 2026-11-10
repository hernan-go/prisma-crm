import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../server/errors';
import { bindingRouter } from '../server/binding-http';
import { query } from '../server/db';
import { completeGoogleLogin } from '../server/identity';

vi.mock('../server/db', () => ({ query: vi.fn() }));
vi.mock('../server/binding-operations', () => ({
  browserBindings: () => ({}),
  bindingPreflight: vi.fn(),
  bindingMaintenance: vi.fn(),
}));
vi.mock('../server/identity', () => ({ completeGoogleLogin: vi.fn() }));
vi.mock('../server/google-oidc', () => ({
  createGoogleOidc: () => ({ complete: vi.fn(), evidenceReference: vi.fn() }),
}));

it.each([true, false])(
  'renders the correct browser response for authorization denial=%s',
  async (denied) => {
    const id = randomUUID();
    const browser = 'a'.repeat(43);
    vi.mocked(query).mockImplementation(async (sql) =>
      sql.includes('state_hash=?')
        ? [
            {
              id,
              browser_hash: createHash('sha256').update(browser).digest('hex'),
              purpose: 'login',
            },
          ]
        : [{ name: '020.sql' }],
    );
    vi.mocked(completeGoogleLogin).mockRejectedValueOnce(
      denied ? new AppError(403, 'private detail') : Error('private detail'),
    );
    const app = express().use(
      bindingRouter({
        google: {
          redirectUri: 'http://localhost:5173/api/auth/google/callback',
          clientId: 'test',
          clientSecret: 'test',
          activeKeyId: 'test',
          keys: {},
        },
        csrfKey: 'ab'.repeat(32),
        database: 'synthetic',
        loginEnabled: true,
      }),
    );
    const res = await request(app)
      .get('/api/auth/google/callback?state=' + 'b'.repeat(43))
      .set('Cookie', 'prisma_login=' + id + '.' + browser)
      .expect(denied ? 303 : 400);
    if (denied) expect(res.headers.location).toBe('/login?google=denied');
    else expect(res.type).toBe('text/html');
    expect(res.text).not.toContain('private detail');
    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain('prisma_login=;');
    expect(cookies).toContain('prisma_login_csrf=;');
    expect(cookies).not.toContain('prisma_identity=');
  },
);
