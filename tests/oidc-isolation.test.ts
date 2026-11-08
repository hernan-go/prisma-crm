import { afterAll, expect, it, vi } from 'vitest';
import request from 'supertest';
import { pool } from '../server/db';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';

afterAll(() => pool.end());
it('importing the unconfigured OIDC core leaves legacy login/session/logout independent and no Google routes mounted', async () => {
  const blocked = vi
    .spyOn(pool, 'getConnection')
    .mockRejectedValue(new Error('Forbidden DB access'));
  try {
    await import('../server/google-oidc');
    const credentials = await testCredentials();
    const agent = request.agent(createApp({ ...credentials, store: memorySessions() }));
    await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
    expect((await agent.get('/api/auth/session').expect(200)).body.authenticated).toBe(true);
    for (const route of ['/api/auth/google', '/api/auth/google/callback', '/api/identity'])
      await agent.get(route).expect(404);
    await agent.post('/api/auth/logout').expect(200);
    expect((await agent.get('/api/auth/session').expect(200)).body.authenticated).toBe(false);
    expect(blocked).not.toHaveBeenCalled();
  } finally {
    blocked.mockRestore();
  }
});
