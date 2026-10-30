import { afterAll, afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app';
import { pool } from '../server/db';
import { AppError } from '../server/errors';
import type { AiIntegrationOptions } from '../server/integrations/ai-router';
const token = 'a'.repeat(64);
const empty = { version: '1.0' as const, mode: 'list' as const, documents: [], next_after: null };
const url = '/api/integrations/ai/knowledge';
function fixture(readKnowledge: AiIntegrationOptions['readKnowledge'] = async () => empty) {
  vi.stubEnv('NODE_ENV', 'test');
  return createApp(
    { hash: '', secret: '' },
    {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      publicOrigin: 'https://crm.example.invalid',
      trustedProxyIps: '127.0.0.1',
      transportMode: 'verified_peer',
      allowLocalHttp: true,
      readKnowledge,
    },
  );
}
afterEach(() => vi.unstubAllEnvs());
afterAll(() => pool.end());
it('empty library is explicit, uncached and requires a valid service credential', async () => {
  const read = vi.fn(async () => empty);
  const app = fixture(read);
  for (const credential of ['', 'Bearer wrong', `Bearer ${'b'.repeat(64)}`])
    await request(app).get(url).set('Authorization', credential).expect(401);
  expect(read).not.toHaveBeenCalled();
  const result = await request(app).get(url).auth(token, { type: 'bearer' }).expect(200);
  expect(result.body).toEqual(empty);
  expect(result.headers['cache-control']).toBe('no-store');
  await request(app).get('/api/knowledge/documents').auth(token, { type: 'bearer' }).expect(503);
});
it.each(['post', 'put', 'delete', 'head'] as const)('rejects method %s', async (method) => {
  await request(fixture())[method](url).auth(token, { type: 'bearer' }).expect(405);
});
it('rejects insecure transport, browser origin, invalid queries and bodies before reading', async () => {
  const read = vi.fn(async () => empty);
  const app = fixture(read);
  await request(app)
    .get(url)
    .set('Host', 'evil.invalid')
    .auth(token, { type: 'bearer' })
    .expect(403);
  await request(app)
    .get(url)
    .set('Origin', 'https://crm.example.invalid')
    .auth(token, { type: 'bearer' })
    .expect(403);
  for (const query of [
    '?id=bad',
    '?status=inactive',
    '?category=-1',
    '?q=a&q=b',
    '?after=bad',
    '?id=00000000-0000-4000-8000-000000000001&q=x',
  ])
    await request(app)
      .get(url + query)
      .auth(token, { type: 'bearer' })
      .expect(422);
  await request(app).get(url).auth(token, { type: 'bearer' }).send({ q: 'x' }).expect(422);
  expect(read).not.toHaveBeenCalled();
});
it('returns current reads and sanitized failures without private contents', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(empty)
    .mockRejectedValueOnce(new AppError(404, 'private'))
    .mockRejectedValueOnce(Error('SQL private secret'))
    .mockResolvedValueOnce({ private: 'private' });
  const app = fixture(read);
  await request(app).get(url).auth(token, { type: 'bearer' }).expect(200);
  for (const status of [404, 503, 503]) {
    const response = await request(app).get(url).auth(token, { type: 'bearer' }).expect(status);
    expect(response.text).not.toMatch(/private|secret|SQL/);
  }
});
it('bounds JSON bytes even when Markdown itself fits the storage limit', async () => {
  const app = fixture(async () => ({
    version: '1.0',
    mode: 'document',
    document: {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Fixture',
      category_id: null,
      category_name: null,
      content_version: 1,
      revision: 1,
      updated_at: '2026-10-30',
      content_md: '\n'.repeat(300000),
    },
  }));
  await request(app).get(url).auth(token, { type: 'bearer' }).expect(413);
});
it('bounds simultaneous document reads', async () => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = vi.fn(async () => {
    await barrier;
    return empty;
  });
  const app = fixture(read);
  const get = () => request(app).get(url).auth(token, { type: 'bearer' });
  const first = get().then((r) => r.status);
  const second = get().then((r) => r.status);
  try {
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await get().expect(503);
  } finally {
    release();
    await Promise.all([first, second]);
  }
  await get().expect(200);
});
