import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';

// This suite must never open a database connection, even if local credentials exist.
vi.mock('../server/db', () => {
  const blocked = () => {
    throw new Error('Database access forbidden in SPA fixtures');
  };
  return {
    query: blocked,
    execute: blocked,
    transaction: blocked,
    peopleTransaction: blocked,
    pool: { execute: blocked, getConnection: blocked },
  };
});

const html = '<!doctype html><html><body>SPA fixture</body></html>';
const javascript = 'console.log("fixture");';
const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
let temporaryRoot: string;
let credentials: Awaited<ReturnType<typeof testCredentials>>;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'prisma-spa-'));
  credentials = await testCredentials();
  for (const directory of ['normal', '.nodeapp']) {
    const root = join(temporaryRoot, directory, 'dist', 'client');
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'index.html'), html);
    await writeFile(join(root, 'favicon.svg'), svg);
    await writeFile(join(root, 'assets', 'app.js'), javascript);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

function fixture(directory: string) {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PROXY_DIAGNOSTICS', 'false');
  // Keep the test runner's real cwd unchanged; exercise the app's path resolution.
  vi.spyOn(process, 'cwd').mockReturnValue(join(temporaryRoot, directory));
  return createApp({ ...credentials, store: memorySessions() }, { tokenHash: '' });
}

describe.each(['normal', '.nodeapp'])('SPA deployment in %s', (directory) => {
  it.each(['get', 'head'] as const)('%s serves documents and existing assets', async (method) => {
    const app = fixture(directory);
    for (const path of [
      '/',
      '/index.html',
      '/know-how',
      '/estadisticas',
      '/publicidad',
      '/agenda',
      '/know-how?view=all',
      '/nested/route',
    ]) {
      const pending = request(app)[method](path);
      const response = await pending.expect(200).expect('Content-Type', /text\/html/);
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength(html)));
      expect(response.text).toBe(method === 'get' ? html : undefined);
    }
    for (const [path, content, type] of [
      ['/favicon.svg', svg, /image\/svg\+xml/],
      ['/assets/app.js', javascript, /javascript/],
    ] as const) {
      const response = await request(app)[method](path).expect(200).expect('Content-Type', type);
      expect(response.headers['content-length']).toBe(String(Buffer.byteLength(content)));
      if (method === 'get' && path.endsWith('.js')) expect(response.text).toBe(content);
    }
  });

  it('keeps authentication, administrative API and MCP outside the SPA fallback', async () => {
    const app = fixture(directory);
    for (const method of ['get', 'head'] as const) {
      for (const path of ['/api', '/api/knowledge/documents', '/api/unknown']) {
        await request(app)[method](path).expect(401).expect('Content-Type', /json/);
      }
      const pending = request(app)[method]('/api/integrations/ai/monthly-context?period=2026-10');
      await pending.expect(503).expect('Content-Type', /json/);
    }
    const session = await request(app)
      .get('/api/auth/session')
      .expect(200)
      .expect('Content-Type', /json/);
    expect(session.body).toEqual({ authenticated: false, configured: true });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
    for (const method of ['get', 'head'] as const) {
      await agent[method]('/api/unknown').expect(404).expect('Content-Type', /json/);
    }
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/unknown').expect(401);
  });
});
