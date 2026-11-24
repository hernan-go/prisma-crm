import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pool } from '../server/db';
import { createApp } from '../server/app';
import * as identity from '../server/identity';
import { api, ApiError } from '../client/api';
import { ErrorBox } from '../client/components';

// Replace only the external connection. Routes, deletion and transaction code stay real.
const connection = {
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const token = 'a'.repeat(64);
const app = () =>
  createApp(
    {
      identityEnabled: true,
      hash: `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`,
      secret: 's'.repeat(64),
    },
    {},
    {},
    false,
    false,
  );
const foreignKey = Object.assign(new Error('PRIVATE SQL education_digital_rights'), {
  code: 'ER_ROW_IS_REFERENCED_2',
});
let deleteError: Error | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  deleteError = undefined;
  vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    display_name: 'Synthetic admin',
    status: 'enabled',
    roles: ['admin'],
    expiresAt: Date.now() + 3600000,
  });
  vi.spyOn(pool, 'getConnection').mockResolvedValue(connection as never);
  connection.query.mockResolvedValue([[{ acquired: 1 }]]);
  connection.execute.mockImplementation(async (sql: string) => {
    if (/^SELECT id FROM (activities|instructors) WHERE id=/.test(sql)) return [[{ id: 7 }]];
    if (sql.startsWith('SELECT')) return [[]];
    if (/^DELETE FROM (activities|instructors) WHERE id=/.test(sql) && deleteError)
      throw deleteError;
    return [{ affectedRows: 1 }];
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const remove = (path = '/activities/7') =>
  request(app())
    .delete('/api' + path)
    .set('Cookie', `prisma_identity=${token}`);

it('returns a safe conflict for an activity rejected by a referencing FK and rolls back its transaction', async () => {
  deleteError = foreignKey;
  const response = await remove();
  expect(response.status).toBe(409);
  expect(response.body.message).toMatch(/actividad.*referencias/i);
  expect(response.body.message).toMatch(/archiv/i);
  expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE|SQL|education_|ER_ROW/);
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledOnce();
});

it('still deletes an unreferenced activity and its allowed days atomically', async () => {
  const response = await remove();
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
  expect(
    connection.execute.mock.calls
      .filter(([sql]) => String(sql).startsWith('DELETE'))
      .map(([sql, values]) => [sql, values]),
  ).toEqual([
    ['DELETE FROM activity_allowed_days WHERE activity_id=?', [7]],
    ['DELETE FROM activities WHERE id=?', [7]],
  ]);
  expect(connection.commit).toHaveBeenCalledOnce();
  expect(connection.rollback).not.toHaveBeenCalled();
});

it('does not misreport other database failures as a dependency conflict', async () => {
  deleteError = Object.assign(new Error('PRIVATE transport'), { code: 'ECONNRESET' });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await remove();
  expect(response.status).toBe(500);
  expect(response.body.message).not.toMatch(/PRIVATE|archiv/);
  expect(connection.rollback).toHaveBeenCalledOnce();
  log.mockRestore();
});

it('leaves instructor deletion error handling unchanged', async () => {
  deleteError = foreignKey;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await remove('/instructors/7')).status).toBe(500);
});

it.each(['missing', 'expired', 'revoked'])(
  'keeps %s administrative credentials out of deletion',
  async (state) => {
    vi.mocked(identity.authenticateIdentitySession).mockResolvedValue(undefined);
    const call = request(app()).delete('/api/activities/7');
    if (state !== 'missing') call.set('Cookie', `prisma_identity=${token}`);
    expect((await call).status).toBe(401);
    expect(pool.getConnection).not.toHaveBeenCalled();
  },
);

it('rejects cross-site deletion before any transaction', async () => {
  expect((await remove().set('Origin', 'https://external.invalid')).status).toBe(403);
  expect(pool.getConnection).not.toHaveBeenCalled();
});

it('passes the controlled server message through the client API to the existing administrative alert', async () => {
  deleteError = foreignKey;
  const response = await remove();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response.body), { status: response.status })),
  );
  let error: unknown;
  try {
    await api('/activities/7', 'DELETE');
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(409);
  const html = renderToStaticMarkup(createElement(ErrorBox, { error }));
  expect(html).toContain('role="alert"');
  expect(html).toMatch(/archiv/i);
  expect(html).not.toMatch(/PRIVATE|SQL|education_/);
});
