import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pool, query, execute } from '../server/db';
import { migrate } from '../server/migrate';
import {
  knowledgeCreate,
  knowledgeDocument,
  knowledgeSave,
  knowledgeSetStatus,
} from '../server/knowledge';
import {
  receiveProposal,
  resolveProposal,
  proposalStatus,
  reviewProposal,
  listProposals,
  proposalCounts,
  sha256,
} from '../server/knowledge-proposals';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';

const enabled = process.env.RUN_KNOWLEDGE_PROPOSALS_DB_TESTS === 'true';
const ids: string[] = [];
let verified = false;
async function document() {
  const id = randomUUID();
  ids.push(id);
  await knowledgeCreate({
    id,
    title: 'Documento sintético de propuestas',
    category_id: null,
    content_md: '# Sección\nBase',
  });
  return knowledgeSetStatus(id, { expected_revision: 1, is_active: true });
}
function input(doc: { id: string; revision: number }, content = '# Sección\nPropuesto') {
  return {
    request_id: randomUUID(),
    document_id: doc.id,
    expected_revision: doc.revision,
    content_md: content,
    content_sha256: sha256(content),
  };
}
afterAll(async () => {
  try {
    if (verified)
      for (const id of ids) {
        await execute('DELETE FROM knowledge_edit_proposals WHERE document_id=?', [id]);
        await execute('DELETE FROM knowledge_document_versions WHERE document_id=?', [id]);
        await execute('DELETE FROM knowledge_documents WHERE id=?', [id]);
      }
  } finally {
    await pool.end();
  }
});
describe.skipIf(!enabled)('propuestas exclusivamente en prisma_test local', () => {
  beforeAll(async () => {
    if (
      process.env.DB_NAME !== 'prisma_test' ||
      !['localhost', '127.0.0.1'].includes(process.env.DB_HOST || '127.0.0.1')
    )
      throw Error('Only local prisma_test');
    expect((await query('SELECT DATABASE() db'))[0].db).toBe('prisma_test');
    expect(await query("SELECT name FROM schema_migrations WHERE name='012.sql'")).toHaveLength(1);
    await migrate('013.sql');
    verified = true;
  });
  it('migration is registered, repeatable and refuses partial application', async () => {
    await migrate('013.sql');
    expect(await query("SELECT name FROM schema_migrations WHERE name='013.sql'")).toHaveLength(1);
    await execute("DELETE FROM schema_migrations WHERE name='013.sql'");
    try {
      await expect(migrate('013.sql')).rejects.toThrow('tabla de propuestas');
    } finally {
      await execute("INSERT INTO schema_migrations(name) VALUES ('013.sql')");
    }
  });
  it('receives without changing document, deduplicates concurrent requests and rejects reused keys', async () => {
    const doc = await document(),
      body = input(doc);
    const [a, b] = await Promise.all([receiveProposal(body), receiveProposal(body)]);
    expect(a.proposal_id).toBe(b.proposal_id);
    expect(await knowledgeDocument(doc.id)).toEqual(doc);
    expect(await listProposals(doc.id)).toHaveLength(1);
    expect((await proposalCounts()).find((p) => p.document_id === doc.id)?.pending_count).toBe(1);
    await expect(
      receiveProposal({ ...body, content_md: 'otra', content_sha256: sha256('otra') }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await query('SELECT * FROM knowledge_document_versions WHERE document_id=?', [doc.id]),
    ).toHaveLength(1);
  });
  it('approval is exact, versioned and durable across service instances', async () => {
    const doc = await document(),
      body = input(doc, '# Sección\nExacto á 😀\r\n');
    const p = await receiveProposal(body);
    const decision = { content_sha256: p.content_sha256 };
    const [a, b] = await Promise.all([
      resolveProposal(p.proposal_id, 'approve', decision),
      resolveProposal(p.proposal_id, 'approve', decision),
    ]);
    expect(a).toEqual(b);
    expect(a.status).toBe('approved');
    const saved = await knowledgeDocument(doc.id);
    expect(saved).toMatchObject({
      id: doc.id,
      title: doc.title,
      category_id: doc.category_id,
      is_active: true,
      content_md: body.content_md,
      revision: doc.revision + 1,
      content_version: doc.content_version + 1,
    });
    expect(
      await query('SELECT * FROM knowledge_document_versions WHERE document_id=?', [doc.id]),
    ).toHaveLength(2);
    expect(
      (
        await query('SELECT content_md FROM knowledge_edit_proposals WHERE proposal_id=?', [
          p.proposal_id,
        ])
      )[0].content_md,
    ).toBeNull();
    expect(await receiveProposal(body)).toEqual(a);
    const token = 'b'.repeat(64);
    const fresh = createApp({}, {}, { tokenHash: sha256(token), allowLocalHttp: true });
    const replay = await request(fresh)
      .post('/api/integrations/knowledge-proposals')
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(200);
    expect(replay.body).toEqual(a);
    expect(await listProposals(doc.id)).toHaveLength(0);
  });
  it('rejection erases proposed content and keeps only an idempotent receipt', async () => {
    const doc = await document(),
      body = input(doc, 'REJECTED_ONLY_SYNTHETIC_MARKER');
    const p = await receiveProposal(body);
    const result = await resolveProposal(p.proposal_id, 'reject', {
      content_sha256: p.content_sha256,
    });
    expect(result.status).toBe('rejected');
    expect(result.decided_by).toBe('administration');
    expect(await knowledgeDocument(doc.id)).toEqual(doc);
    expect(
      JSON.stringify(
        await query('SELECT * FROM knowledge_edit_proposals WHERE proposal_id=?', [p.proposal_id]),
      ),
    ).not.toContain(body.content_md);
    expect(
      JSON.stringify(
        await query('SELECT * FROM knowledge_document_versions WHERE document_id=?', [doc.id]),
      ),
    ).not.toContain(body.content_md);
    expect(await receiveProposal(body)).toEqual(result);
    await expect(reviewProposal(p.proposal_id)).rejects.toMatchObject({ status: 404 });
    await expect(
      resolveProposal(p.proposal_id, 'approve', { content_sha256: p.content_sha256 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await resolveProposal(p.proposal_id, 'reject', { content_sha256: p.content_sha256 }),
    ).toEqual(result);
  });
  it('approval of one proposal leaves the other outdated and rejectable', async () => {
    const doc = await document();
    const a = await receiveProposal(input(doc, 'primera')),
      b = await receiveProposal(input(doc, 'segunda'));
    await resolveProposal(a.proposal_id, 'approve', { content_sha256: a.content_sha256 });
    expect((await proposalStatus(b.proposal_id)).status).toBe('outdated');
    expect(await listProposals(doc.id)).toHaveLength(1);
    await expect(
      resolveProposal(b.proposal_id, 'approve', { content_sha256: b.content_sha256 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await resolveProposal(b.proposal_id, 'reject', { content_sha256: b.content_sha256 })).status,
    ).toBe('rejected');
  });
  it('manual edit and deactivation prevent stale publication', async () => {
    const doc = await document(),
      p = await receiveProposal(input(doc));
    await knowledgeSave(doc.id, {
      title: doc.title,
      category_id: null,
      content_md: 'Edición posterior',
      expected_revision: doc.revision,
    });
    await expect(
      resolveProposal(p.proposal_id, 'approve', { content_sha256: p.content_sha256 }),
    ).rejects.toMatchObject({ status: 409 });
    const current = await knowledgeDocument(doc.id),
      p2 = await receiveProposal(input(current));
    await knowledgeSetStatus(doc.id, { is_active: false, expected_revision: current.revision });
    expect((await proposalStatus(p2.proposal_id)).status).toBe('outdated');
    await expect(
      resolveProposal(p2.proposal_id, 'approve', { content_sha256: p2.content_sha256 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(receiveProposal(input(await knowledgeDocument(doc.id)))).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rejects hash mismatch and refuses tampered stored content', async () => {
    const doc = await document(),
      body = input(doc);
    await expect(
      receiveProposal({ ...body, content_sha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ status: 422 });
    const p = await receiveProposal(body);
    await expect(
      resolveProposal(p.proposal_id, 'approve', { content_sha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ status: 409 });
    await execute('UPDATE knowledge_edit_proposals SET content_md=? WHERE proposal_id=?', [
      'alterado',
      p.proposal_id,
    ]);
    await expect(
      resolveProposal(p.proposal_id, 'approve', { content_sha256: p.content_sha256 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await knowledgeDocument(doc.id)).toEqual(doc);
    // Rejection remains possible even for damaged pending content.
    await resolveProposal(p.proposal_id, 'reject', { content_sha256: p.content_sha256 });
  });
  it('no-op approval preserves existing version semantics', async () => {
    const doc = await document(),
      p = await receiveProposal(input(doc, doc.content_md));
    const result = await resolveProposal(p.proposal_id, 'approve', {
      content_sha256: p.content_sha256,
    });
    expect(result.result_revision).toBe(doc.revision);
    expect(result.result_content_version).toBe(doc.content_version);
    expect(await knowledgeDocument(doc.id)).toEqual(doc);
  });
  it('snapshot failure rolls back content, version and decision together', async () => {
    const doc = await document(),
      p = await receiveProposal(input(doc));
    // Synthetic occupied next version forces the existing snapshot INSERT to fail.
    await execute(
      `INSERT INTO knowledge_document_versions(document_id,version,title,category_id,category_name,content_md,content_sha256,operation) VALUES (?,?,?,NULL,NULL,?,?,?)`,
      [doc.id, 2, doc.title, 'synthetic', sha256('synthetic'), 'edit'],
    );
    await expect(
      resolveProposal(p.proposal_id, 'approve', { content_sha256: p.content_sha256 }),
    ).rejects.toThrow();
    expect(await knowledgeDocument(doc.id)).toEqual(doc);
    expect((await proposalStatus(p.proposal_id)).status).toBe('pending');
    expect(
      (
        await query('SELECT content_md FROM knowledge_edit_proposals WHERE proposal_id=?', [
          p.proposal_id,
        ])
      )[0].content_md,
    ).not.toBeNull();
  });
  it('approve/reject race resolves once without mixed state', async () => {
    const doc = await document(),
      p = await receiveProposal(input(doc));
    const results = await Promise.allSettled(
      ['approve', 'reject'].map((action) =>
        resolveProposal(p.proposal_id, action as 'approve' | 'reject', {
          content_sha256: p.content_sha256,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const final = await proposalStatus(p.proposal_id),
      saved = await knowledgeDocument(doc.id);
    expect(saved.content_version).toBe(final.status === 'approved' ? 2 : 1);
  });
  it('admin HTTP review is read-only and decisions require session, origin and exact hash', async () => {
    const doc = await document(),
      p = await receiveProposal(input(doc));
    const credentials = await testCredentials();
    const app = createApp({ ...credentials, store: memorySessions() });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
    const path = `/api/knowledge/proposals/${p.proposal_id}`;
    const review = await agent.get(path).expect(200);
    expect(review.body.before_md).toBe(doc.content_md);
    expect(review.body.content_md).toBe('# Sección\nPropuesto');
    await agent.get(path).expect(200);
    expect((await proposalStatus(p.proposal_id)).status).toBe('pending');
    await agent
      .post(path + '/approve')
      .send({ content_sha256: p.content_sha256 })
      .expect(403);
    await agent
      .post(path + '/approve')
      .set('Origin', 'http://localhost:5173')
      .send({ content_sha256: p.content_sha256, title: 'otro' })
      .expect(422);
    await agent
      .post(path + '/approve')
      .set('Origin', 'http://localhost:5173')
      .send({ content_sha256: p.content_sha256 })
      .expect(200);
  });
});
