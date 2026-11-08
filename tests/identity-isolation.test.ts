import { expect, it, afterAll, vi } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { createApp } from '../server/app';
import { pool } from '../server/db';
import { memorySessions, testCredentials } from './auth-helper';
afterAll(() => pool.end());
it('no monta rutas nuevas ni consulta tablas de identidad durante login heredado', async () => {
  const connection = vi.spyOn(pool, 'getConnection').mockRejectedValue(new Error('DB forbidden'));
  const credentials = await testCredentials();
  const agent = request.agent(createApp({ ...credentials, store: memorySessions() }));
  try {
    await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
    expect((await agent.get('/api/auth/session').expect(200)).body.authenticated).toBe(true);
    await agent.get('/api/identity').expect(404);
    await agent.get('/api/auth/google').expect(404);
    await agent.post('/api/auth/logout').expect(200);
    expect(connection).not.toHaveBeenCalled();
    const app = await readFile('server/app.ts', 'utf8');
    expect(app).not.toMatch(/from ['"].*identity/);
  } finally {
    connection.mockRestore();
  }
});
