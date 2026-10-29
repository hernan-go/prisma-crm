import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import request from 'supertest';
import { createApp } from '../server/app';
import { pool } from '../server/db';
import { readMarkdown } from '../server/knowledge';
import {
  documentInput,
  documentUpdate,
  knowledgePillars,
  KNOWLEDGE_MAX_BYTES,
} from '../shared/knowledge';
import { KnowledgePreview } from '../client/KnowledgePreview';
import { memorySessions, testCredentials } from './auth-helper';

afterAll(() => pool.end());
it('cinco plantillas orientativas distintas, sin categorías ni hechos empresariales', () => {
  expect(knowledgePillars).toHaveLength(5);
  expect(new Set(knowledgePillars.map((p) => p.key)).size).toBe(5);
  for (const p of knowledgePillars) {
    expect(p.content_md).toContain('Pendiente de completar');
    expect(p.content_md).not.toMatch(/PRISMA|Reiki|\$/);
    expect(
      documentInput.safeParse({ title: p.title, content_md: p.content_md, category_id: null })
        .success,
    ).toBe(true);
  }
});
it('importación UTF-8 estricta y contenido seguro como texto sin interpretar HTML', () => {
  expect(
    readMarkdown(Buffer.from('# Título\n<script>alert(1)</script>'), '../../archivo.md').content_md,
  ).toContain('<script>');
  expect(() => readMarkdown(Buffer.from([0xc3, 0x28]), 'a.md')).toThrow('UTF-8');
  expect(() => readMarkdown(Buffer.from('a\0b'), 'a.md')).toThrow();
  expect(() => readMarkdown(Buffer.from('texto'), 'a.html')).toThrow('.md');
  expect(readMarkdown(Buffer.from('\ufeff# Texto'), 'a.MD').content_md).toBe('# Texto');
});
it('límite en bytes para importar y para pegar texto, no sólo caracteres', () => {
  const input = { title: 'QA', category_id: null, content_md: 'a'.repeat(KNOWLEDGE_MAX_BYTES) };
  expect(documentInput.safeParse(input).success).toBe(true);
  expect(readMarkdown(Buffer.from(input.content_md), 'a.md').content_md.length).toBe(
    KNOWLEDGE_MAX_BYTES,
  );
  expect(() => readMarkdown(Buffer.alloc(KNOWLEDGE_MAX_BYTES + 1, 65), 'a.md')).toThrow('512 KiB');
  expect(
    documentInput.safeParse({ ...input, content_md: 'á'.repeat(KNOWLEDGE_MAX_BYTES) }).success,
  ).toBe(false);
  expect(
    documentUpdate.safeParse({ ...input, expected_revision: 1, is_active: true }).success,
  ).toBe(false);
});
it.each([
  '<script>alert(1)</script>\n\n<img src="https://example.com/track" onerror="alert(1)">',
  '![tracking](https://example.com/track)\n\n[attack](javascript:alert%281%29)',
  '[attack](data:text/html,attack)\n\n[local](/api/auth/logout)\n\n<iframe src="https://example.com"/>',
])('vista previa bloquea HTML, imágenes y protocolos peligrosos: %s', (content) => {
  const html = renderToStaticMarkup(createElement(KnowledgePreview, { content }));
  expect(html).not.toMatch(/<script|<img|<iframe|href="(?:javascript:|data:|\/)|onerror=/);
});
it('enlaces externos seguros, sin referrer, sin abrir acceso al opener', () => {
  const html = renderToStaticMarkup(
    createElement(KnowledgePreview, { content: '[fuente](https://example.com)' }),
  );
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('referrerPolicy="no-referrer"');
});
describe('API autenticada y validación sin DB', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  beforeAll(async () => {
    const credentials = await testCredentials();
    app = createApp({ ...credentials, store: memorySessions() });
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
  });
  it.each([
    '/state',
    '/categories',
    '/documents',
    '/documents/00000000-0000-4000-8000-000000000001/export',
  ])('Bearer no sustituye sesión: %s', async (path) => {
    const response = await request(app)
      .get(`/api/knowledge${path}`)
      .set('Authorization', 'Bearer synthetic-only');
    expect(response.status).toBe(401);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('escritura externa rechazada', async () => {
    await agent
      .post('/api/knowledge/initialize')
      .set('Origin', 'https://example.com')
      .send({})
      .expect(403);
  });
  it('importación válida no escribe documentos y exporta contenido privado no cacheable', async () => {
    const r = await agent
      .post('/api/knowledge/import')
      .attach('file', Buffer.from('# Ejemplo'), 'test.md')
      .expect(200);
    expect(r.body).toEqual({ content_md: '# Ejemplo' });
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('rechaza archivo grande, formato incorrecto, binarios y múltiples archivos', async () => {
    await agent
      .post('/api/knowledge/import')
      .attach('file', Buffer.alloc(KNOWLEDGE_MAX_BYTES + 1, 65), 'a.md')
      .expect(413);
    await agent.post('/api/knowledge/import').attach('file', Buffer.from('a'), 'a.txt').expect(422);
    await agent
      .post('/api/knowledge/import')
      .attach('file', Buffer.from([0xff]), 'a.md')
      .expect(422);
    await agent
      .post('/api/knowledge/import')
      .attach('file', Buffer.from('a'), 'a.md')
      .attach('file', Buffer.from('b'), 'b.md')
      .expect(422);
  });
  it('rechaza contratos ajenos al alcance', async () => {
    await agent
      .post('/api/knowledge/documents')
      .send({ title: 'QA', content_md: '', category_id: null, is_active: true })
      .expect(422);
    await agent.get('/api/knowledge/documents?period_id=1').expect(422);
    await agent.delete('/api/knowledge/documents/00000000-0000-4000-8000-000000000001').expect(404);
  });
});
