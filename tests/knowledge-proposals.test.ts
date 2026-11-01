import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApp } from '../server/app';
import { pool } from '../server/db';
import { sha256 } from '../server/knowledge-proposals';
import { proposalInput, type ProposalReceipt } from '../shared/knowledge-proposals';
import {
  proposalIntegration,
  type ProposalIntegrationOptions,
} from '../server/integrations/knowledge-proposals-router';
import { knowledgeDiff } from '../client/knowledge-diff';
import { ProposalBadge, ProposalComparison } from '../client/KnowledgeProposals';
import { testCredentials, memorySessions } from './auth-helper';
import express from 'express';

const token = 'b'.repeat(64),
  readToken = 'a'.repeat(64);
const url = '/api/integrations/knowledge-proposals';
const input = {
  request_id: randomUUID(),
  document_id: randomUUID(),
  expected_revision: 2,
  content_md: '# Nuevo',
  content_sha256: sha256('# Nuevo'),
};
const receive = vi.fn(
  async () => ({ proposal_id: randomUUID(), status: 'pending' }) as ProposalReceipt,
);
const status = vi.fn(
  async () => ({ proposal_id: randomUUID(), status: 'rejected' }) as ProposalReceipt,
);
function options(extra: ProposalIntegrationOptions = {}): ProposalIntegrationOptions {
  return {
    tokenHash: sha256(token),
    readTokenHash: sha256(readToken),
    allowLocalHttp: true,
    receive,
    status,
    ...extra,
  };
}
function fixture(extra: ProposalIntegrationOptions = {}) {
  return express().use(url, proposalIntegration(options(extra)));
}
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => pool.end());

it('service is disabled without configuration or with the read credential reused', async () => {
  await request(fixture({ tokenHash: '' }))
    .post(url)
    .send(input)
    .expect(503);
  await request(fixture({ tokenHash: sha256(readToken) }))
    .post(url)
    .send(input)
    .expect(503);
  expect(receive).not.toHaveBeenCalled();
});
it('requires proposal credential and returns only a receipt', async () => {
  const app = fixture();
  for (const value of ['', readToken, 'c'.repeat(64)])
    await request(app).post(url).auth(value, { type: 'bearer' }).send(input).expect(401);
  const result = await request(app)
    .post(url)
    .auth(token, { type: 'bearer' })
    .send(input)
    .expect(200);
  expect(result.headers['cache-control']).toBe('no-store');
  expect(result.body.content_md).toBeUndefined();
  await request(app).get(`${url}/${randomUUID()}`).auth(token, { type: 'bearer' }).expect(200);
  expect(status).toHaveBeenCalledOnce();
});
it.each(['Origin', 'Cookie', 'Referer', 'Sec-Fetch-Site'])(
  'rejects browser header %s',
  async (header) => {
    await request(fixture())
      .post(url)
      .set(header, 'untrusted')
      .auth(token, { type: 'bearer' })
      .send(input)
      .expect(403);
    expect(receive).not.toHaveBeenCalled();
  },
);
it('rejects wrong host, plaintext and production localhost bypass', async () => {
  await request(fixture())
    .post(url)
    .set('Host', 'evil.invalid')
    .auth(token, { type: 'bearer' })
    .send(input)
    .expect(403);
  await request(fixture({ allowLocalHttp: false, publicOrigin: 'https://crm.example.invalid' }))
    .post(url)
    .set('Host', 'crm.example.invalid')
    .auth(token, { type: 'bearer' })
    .send(input)
    .expect(403);
  vi.stubEnv('NODE_ENV', 'production');
  await request(fixture({ publicOrigin: 'https://crm.example.invalid' }))
    .post(url)
    .auth(token, { type: 'bearer' })
    .send(input)
    .expect(403);
});
it('service cannot approve, reject or use unrelated methods and routes', async () => {
  const app = fixture();
  for (const action of ['approve', 'reject'])
    await request(app)
      .post(`${url}/${randomUUID()}/${action}`)
      .auth(token, { type: 'bearer' })
      .send({})
      .expect(404);
  await request(app).delete(url).auth(token, { type: 'bearer' }).expect(405);
  expect(receive).not.toHaveBeenCalled();
});
it('bounds JSON and hides internal errors', async () => {
  await request(fixture())
    .post(url)
    .auth(token, { type: 'bearer' })
    .set('Content-Type', 'application/json')
    .send('{')
    .expect(400);
  await request(fixture())
    .post(url)
    .auth(token, { type: 'bearer' })
    .send({ text: 'x'.repeat(4 * 1024 * 1024) })
    .expect(413);
  const result = await request(
    fixture({
      receive: async () => {
        throw Error('private SQL and token');
      },
    }),
  )
    .post(url)
    .auth(token, { type: 'bearer' })
    .send(input)
    .expect(503);
  expect(result.text).not.toContain('private');
  await request(fixture())
    .post(url + '?approved=true')
    .auth(token, { type: 'bearer' })
    .send(input)
    .expect(422);
});
it('rate limits authorized submissions', async () => {
  const app = fixture();
  for (let i = 0; i < 20; i++)
    await request(app).post(url).auth(token, { type: 'bearer' }).send(input).expect(200);
  await request(app).post(url).auth(token, { type: 'bearer' }).send(input).expect(429);
});
it('admin requires session and explicit same-origin CSRF protection', async () => {
  const credentials = await testCredentials();
  const app = createApp(
    { ...credentials, store: memorySessions() },
    { tokenHash: sha256(readToken), allowLocalHttp: true },
    options(),
  );
  const path = `/api/knowledge/proposals/${randomUUID()}/approve`;
  await request(app).post(path).auth(token, { type: 'bearer' }).send({}).expect(401);
  await request(app).get('/api/knowledge/documents').auth(token, { type: 'bearer' }).expect(401);
  await request(app)
    .get('/api/integrations/ai/knowledge')
    .auth(token, { type: 'bearer' })
    .expect(401);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
  await agent.post(path).send({}).expect(403);
  await agent.post(path).set('Origin', 'https://evil.invalid').send({}).expect(403);
  // With valid session and origin, strict decision schema rejects before touching DB.
  await agent
    .post(path)
    .set('Origin', 'http://localhost:5173')
    .send({ approved: true })
    .expect(422);
});
describe('contract and comparison', () => {
  it('rejects metadata, oversized multibyte and control characters', () => {
    for (const body of [
      { ...input, title: 'x' },
      { ...input, is_active: false },
      { ...input, content_md: '😀'.repeat(131073) },
      { ...input, content_md: '\u0000' },
    ])
      expect(proposalInput.safeParse(body).success).toBe(false);
    expect(proposalInput.safeParse({ ...input, content_md: '😀'.repeat(131072) }).success).toBe(
      true,
    );
  });
  it('finds multiple relevant edits with common context and no invented section', () => {
    const diff = knowledgeDiff(
      '# Uno\na\nb\nc\nd\ne\nf\ng\n# Dos\nx',
      '# Uno\na\nB\nc\nd\ne\nf\ng\n# Dos\ny',
    );
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(2);
    expect(diff.section).toBeNull();
    expect(diff.rows.some((r) => r.kind === 'same' && r.text === 'a')).toBe(true);
    expect(knowledgeDiff('# Sección\na', '# Sección\na\nb').section).toBe('Sección');
    expect(knowledgeDiff('igual', 'igual').type).toBe('Sin cambios');
  });
  it('renders untrusted Markdown only as text and a real pending count', () => {
    const html = renderToStaticMarkup(
      createElement(ProposalComparison, {
        before: 'común\nold',
        after: 'común\n<script>alert(1)</script>',
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<ins>');
    expect(html).toContain('<del>');
    expect(
      renderToStaticMarkup(createElement(ProposalBadge, { count: 2, open: () => {} })),
    ).toContain('cambios pendientes');
    expect(renderToStaticMarkup(createElement(ProposalBadge, { count: 0, open: () => {} }))).toBe(
      '',
    );
  });
  it('preserves common text inside replacements and limits rendered diff fragments', () => {
    const diff = knowledgeDiff('Texto común original.', 'Texto común nuevo.');
    expect(diff.rows.find((r) => r.kind === 'added')).toMatchObject({
      prefix: 'Texto común ',
      suffix: '.',
      change: 'nuevo',
    });
    const html = renderToStaticMarkup(
      createElement(ProposalComparison, {
        before: 'old\n'.repeat(10000),
        after: 'new\n'.repeat(10000),
      }),
    );
    expect(html).toContain('Fragmento siguiente');
    expect((html.match(/class="proposal-line/g) ?? []).length).toBeLessThanOrEqual(200);
    expect(proposalInput.safeParse({ ...input, content_md: '\ud800' }).success).toBe(false);
  });
});
