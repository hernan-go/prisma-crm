import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pool, query, execute } from '../server/db';
import { migrate } from '../server/migrate';
import {
  knowledgeCreate,
  knowledgeSave,
  knowledgeDocument,
  knowledgeSetStatus,
  knowledgeCategorySave,
  initializeKnowledge,
} from '../server/knowledge';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';

const enabled = process.env.RUN_KNOWLEDGE_DB_TESTS === 'true';
const tables = [
  'knowledge_document_versions',
  'knowledge_documents',
  'knowledge_categories',
  'knowledge_library_state',
];
let verified = false;
afterAll(async () => {
  try {
    if (verified) for (const table of tables) await execute(`DELETE FROM ${table}`);
  } finally {
    await pool.end();
  }
});
describe.skipIf(!enabled)('Know-How exclusivamente prisma_test', () => {
  beforeAll(async () => {
    if (
      process.env.DB_NAME !== 'prisma_test' ||
      !['localhost', '127.0.0.1'].includes(process.env.DB_HOST || '127.0.0.1')
    )
      throw Error('Only local prisma_test');
    expect((await query('SELECT DATABASE() db'))[0].db).toBe('prisma_test');
    verified = true;
    expect(await query("SELECT name FROM schema_migrations WHERE name='011.sql'")).toHaveLength(1);
    for (const t of tables) await execute(`DROP TABLE IF EXISTS ${t}`);
    await execute("DELETE FROM schema_migrations WHERE name='012.sql'");
    await migrate('012.sql');
  });
  it('migración vacía, índices/FK correctos, repetición registrada sin cambios', async () => {
    for (const t of tables) expect(await query(`SELECT * FROM ${t}`)).toHaveLength(0);
    const constraints = await query(
      "SELECT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'knowledge_%' AND REFERENCED_TABLE_NAME IS NOT NULL",
    );
    expect(constraints.map((r) => r.REFERENCED_TABLE_NAME).sort()).toEqual([
      'knowledge_categories',
      'knowledge_documents',
    ]);
    await migrate('012.sql');
    expect(await query("SELECT name FROM schema_migrations WHERE name='012.sql'")).toHaveLength(1);
  });
  it('aplicación parcial sin registro se rechaza antes de modificar datos', async () => {
    await execute("DELETE FROM schema_migrations WHERE name='012.sql'");
    try {
      await expect(migrate('012.sql')).rejects.toThrow('estructuras documentales');
    } finally {
      await execute("INSERT INTO schema_migrations(name) VALUES ('012.sql')");
    }
  });
  it('pilares simultáneos se crean una vez y nunca sobrescriben ediciones', async () => {
    await Promise.all([initializeKnowledge(), initializeKnowledge(), initializeKnowledge()]);
    expect(await query('SELECT id FROM knowledge_documents')).toHaveLength(5);
    expect(await query('SELECT document_id FROM knowledge_document_versions')).toHaveLength(5);
    expect(await query('SELECT id FROM knowledge_documents WHERE is_active=1')).toHaveLength(0);
    expect(await query('SELECT id FROM knowledge_categories')).toHaveLength(0);
    const d = await knowledgeDocument('b677db44-79d5-4ea3-892f-000000000001');
    await knowledgeSave(d.id, {
      title: d.title,
      category_id: null,
      content_md: '# Edición sintética',
      expected_revision: d.revision,
    });
    await initializeKnowledge();
    expect((await knowledgeDocument(d.id)).content_md).toBe('# Edición sintética');
  });
  it('inicialización falla atómicamente y marca persistente no recrea pilares ausentes', async () => {
    await execute(
      'UPDATE knowledge_library_state SET pillars_initialized_at=NULL,pillars_template_version=NULL WHERE id=1',
    );
    const count = (await query('SELECT COUNT(*) n FROM knowledge_documents'))[0].n;
    await expect(initializeKnowledge()).rejects.toThrow();
    expect((await query('SELECT COUNT(*) n FROM knowledge_documents'))[0].n).toBe(count);
    expect(
      (await query('SELECT pillars_initialized_at FROM knowledge_library_state'))[0]
        .pillars_initialized_at,
    ).toBeNull();
    await execute(
      'UPDATE knowledge_library_state SET pillars_initialized_at=CURRENT_TIMESTAMP(3),pillars_template_version=1 WHERE id=1',
    );
    await execute(
      "DELETE FROM knowledge_document_versions WHERE document_id='b677db44-79d5-4ea3-892f-000000000005'",
    );
    await execute(
      "DELETE FROM knowledge_documents WHERE id='b677db44-79d5-4ea3-892f-000000000005'",
    );
    await initializeKnowledge();
    expect(
      await query("SELECT id FROM knowledge_documents WHERE pillar_key='strategy'"),
    ).toHaveLength(0);
  });
  it('creación idempotente, edición, versiones, activación y conflictos', async () => {
    const input = {
      id: randomUUID(),
      title: 'Documento QA',
      category_id: null,
      content_md: '# Uno',
    };
    await Promise.all([knowledgeCreate(input), knowledgeCreate(input)]);
    expect(await query('SELECT id FROM knowledge_documents WHERE id=?', [input.id])).toHaveLength(
      1,
    );
    let d = await knowledgeDocument(input.id);
    expect(d.is_active).toBe(false);
    d = await knowledgeSetStatus(d.id, { expected_revision: 1, is_active: true });
    expect(d.revision).toBe(2);
    expect(d.content_version).toBe(1);
    expect(
      await query('SELECT version FROM knowledge_document_versions WHERE document_id=?', [d.id]),
    ).toHaveLength(1);
    await expect(
      knowledgeSave(d.id, {
        title: d.title,
        category_id: null,
        content_md: 'stale',
        expected_revision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const results = await Promise.allSettled(
      ['# Dos', '# Tres'].map((content_md) =>
        knowledgeSave(d.id, {
          title: d.title,
          category_id: null,
          content_md,
          expected_revision: 2,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    d = await knowledgeDocument(d.id);
    const v = (
      await query('SELECT * FROM knowledge_document_versions WHERE document_id=? AND version=?', [
        d.id,
        d.content_version,
      ])
    )[0];
    expect(v.content_md).toBe(d.content_md);
    expect(v.title).toBe(d.title);
    expect(v.category_id).toBe(d.category_id);
    await knowledgeSave(d.id, {
      title: d.title,
      category_id: null,
      content_md: d.content_md,
      expected_revision: d.revision,
    });
    expect((await knowledgeDocument(d.id)).revision).toBe(d.revision);
    for (let i = 0; i < 7; i++) {
      d = await knowledgeSave(d.id, {
        title: d.title,
        category_id: null,
        content_md: `# Revisión ${i}`,
        expected_revision: d.revision,
      });
    }
    expect(
      await query('SELECT version FROM knowledge_document_versions WHERE document_id=?', [d.id]),
    ).toHaveLength(9);
    const inactive = await knowledgeSetStatus(d.id, {
      expected_revision: d.revision,
      is_active: false,
    });
    expect(inactive.content_version).toBe(d.content_version);
    expect(inactive.is_active).toBe(false);
  });
  it('categorías únicas, ordenables, archivables y cambio de categoría versionado', async () => {
    const category = await knowledgeCategorySave({ name: 'Categoría QA', position: 1 });
    await expect(
      knowledgeCategorySave({ name: 'categoría qa', position: 2 }),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    const d = await knowledgeCreate({
      id: randomUUID(),
      title: 'Con categoría',
      category_id: category.id,
      content_md: 'Texto',
    });
    await knowledgeCategorySave(
      { name: category.name, position: 3, archived: true, expected_revision: 1 },
      category.id,
    );
    await expect(
      knowledgeCategorySave(
        { name: 'Otro', position: 1, archived: false, expected_revision: 1 },
        category.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      knowledgeCreate({
        id: randomUUID(),
        title: 'No válido',
        category_id: category.id,
        content_md: '',
      }),
    ).rejects.toMatchObject({ status: 422 });
    const saved = await knowledgeSave(d.id, {
      title: d.title,
      category_id: null,
      content_md: d.content_md,
      expected_revision: 1,
    });
    expect(saved.content_version).toBe(2);
    expect(
      (
        await query(
          'SELECT category_name FROM knowledge_document_versions WHERE document_id=? AND version=1',
          [d.id],
        )
      )[0].category_name,
    ).toBe('Categoría QA');
  });
  it('fallo al insertar revisión revierte el documento vigente', async () => {
    const d = await knowledgeCreate({
      id: randomUUID(),
      title: 'Rollback QA',
      category_id: null,
      content_md: 'Original',
    });
    await execute(
      'INSERT INTO knowledge_document_versions(document_id,version,title,content_md,content_sha256,operation) VALUES (?,2,?,?,?,?)',
      [d.id, 'Colisión sintética', '', '0'.repeat(64), 'edit'],
    );
    await expect(
      knowledgeSave(d.id, {
        title: 'No persistir',
        category_id: null,
        content_md: 'Cambio',
        expected_revision: 1,
      }),
    ).rejects.toThrow();
    expect(await knowledgeDocument(d.id)).toEqual(d);
    await execute('DELETE FROM knowledge_document_versions WHERE document_id=? AND version=2', [
      d.id,
    ]);
  });
  it('períodos no afectan documentos ni revisiones', async () => {
    const before = await query('SELECT * FROM knowledge_documents ORDER BY id');
    const versions = await query(
      'SELECT * FROM knowledge_document_versions ORDER BY document_id,version',
    );
    const period = await execute("INSERT INTO periods(year,month,status) VALUES (2088,12,'open')");
    try {
      await execute("UPDATE periods SET status='closed' WHERE id=?", [period.insertId]);
      await execute("UPDATE periods SET status='open',month=11 WHERE id=?", [period.insertId]);
    } finally {
      await execute('DELETE FROM periods WHERE id=?', [period.insertId]);
    }
    expect(await query('SELECT * FROM knowledge_documents ORDER BY id')).toEqual(before);
    expect(
      await query('SELECT * FROM knowledge_document_versions ORDER BY document_id,version'),
    ).toEqual(versions);
  });
  it('API real: consulta, filtros, exportación, categoría y activación', async () => {
    const credentials = await testCredentials();
    const app = createApp({ ...credentials, store: memorySessions() });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: credentials.password }).expect(200);
    const input = {
      id: randomUUID(),
      title: 'Exportación HTTP QA',
      category_id: null,
      content_md: '# Documento\n\nAcentos áéí',
    };
    const created = await agent.post('/api/knowledge/documents').send(input).expect(201);
    expect(created.body.is_active).toBe(false);
    const result = await agent.get(`/api/knowledge/documents/${input.id}/export`).expect(200);
    expect(result.text).toBe(input.content_md);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-disposition']).toContain(`${input.id}.md`);
    const list = await agent
      .get('/api/knowledge/documents?q=Exportación&status=inactive&category=none')
      .expect(200);
    expect(list.body.rows).toHaveLength(1);
    expect(list.body.rows[0].content_md).toBeUndefined();
    await agent
      .patch(`/api/knowledge/documents/${input.id}/status`)
      .send({ expected_revision: 1, is_active: true })
      .expect(200);
    await agent
      .put(`/api/knowledge/documents/${input.id}`)
      .send({ title: input.title, category_id: null, content_md: 'Stale', expected_revision: 1 })
      .expect(409);
  });
});
