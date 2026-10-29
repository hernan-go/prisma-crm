import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { query, execute, transaction, type Connection } from './db.js';
import { AppError } from './errors.js';
import {
  categoryInput,
  categoryUpdate,
  documentInput,
  documentUpdate,
  documentStatus,
  documentFilters,
  knowledgePillars,
  KNOWLEDGE_MAX_BYTES,
  markdown,
  type KnowledgeDocument,
  type KnowledgeInput,
} from '../shared/knowledge.js';

const uuid = z.string().uuid();
const createInput = documentInput.extend({ id: uuid }).strict();
const select = `SELECT d.*,c.name category_name FROM knowledge_documents d LEFT JOIN knowledge_categories c ON c.id=d.category_id`;
const summary = `SELECT d.id,d.title,d.category_id,c.name category_name,d.is_active,d.revision,d.content_version,d.created_at,d.updated_at,d.pillar_key FROM knowledge_documents d LEFT JOIN knowledge_categories c ON c.id=d.category_id`;
function normalize(row: any): KnowledgeDocument {
  return { ...row, is_active: Boolean(row.is_active) };
}
async function lockLibrary(db: Connection) {
  // An upsert takes the exclusive row lock directly; INSERT IGNORE would take
  // shared duplicate-key locks that deadlock when concurrent writers upgrade.
  await execute(
    'INSERT INTO knowledge_library_state(id) VALUES (1) ON DUPLICATE KEY UPDATE id=1',
    [],
    db,
  );
  return (await query('SELECT * FROM knowledge_library_state WHERE id=1 FOR UPDATE', [], db))[0];
}
async function categoryName(id: number | null, db: Connection, existing?: number | null) {
  if (id === null) return null;
  const row = (
    await query('SELECT name,archived_at FROM knowledge_categories WHERE id=?', [id], db)
  )[0];
  if (!row || (row.archived_at && id !== existing))
    throw new AppError(422, 'Seleccioná una categoría disponible.');
  return row.name as string;
}
export async function knowledgeDocument(id: string, db?: Connection) {
  const row = (
    await query(`${select} WHERE d.id=? AND d.deleted_at IS NULL`, [uuid.parse(id)], db)
  )[0];
  if (!row) throw new AppError(404, 'Documento no encontrado.');
  return normalize(row);
}
function requireRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new AppError(
      409,
      'El registro cambió en otra sesión. Conservá tus cambios y consultá la versión vigente.',
    );
}
async function snapshot(
  id: string,
  version: number,
  input: KnowledgeInput,
  name: string | null,
  operation: string,
  db: Connection,
) {
  await execute(
    `INSERT INTO knowledge_document_versions(document_id,version,title,category_id,category_name,content_md,content_sha256,operation) VALUES (?,?,?,?,?,?,?,?)`,
    [
      id,
      version,
      input.title,
      input.category_id,
      name,
      input.content_md,
      createHash('sha256').update(input.content_md).digest('hex'),
      operation,
    ],
    db,
  );
}
async function insertDocument(
  id: string,
  input: KnowledgeInput,
  db: Connection,
  pillar: string | null = null,
) {
  const name = await categoryName(input.category_id, db);
  await execute(
    'INSERT INTO knowledge_documents(id,title,category_id,content_md,pillar_key) VALUES (?,?,?,?,?)',
    [id, input.title, input.category_id, input.content_md, pillar],
    db,
  );
  await snapshot(id, 1, input, name, pillar ? 'pillar' : 'create', db);
  return knowledgeDocument(id, db);
}
export async function knowledgeCreate(body: unknown) {
  const { id, ...input } = createInput.parse(body);
  return transaction(async (db) => {
    await lockLibrary(db);
    const existing = (await query('SELECT * FROM knowledge_documents WHERE id=?', [id], db))[0];
    if (existing) {
      if (
        existing.deleted_at ||
        existing.title !== input.title ||
        existing.category_id !== input.category_id ||
        existing.content_md !== input.content_md
      )
        throw new AppError(409, 'Ese identificador ya corresponde a otro documento o contenido.');
      return knowledgeDocument(id, db);
    }
    return insertDocument(id, input, db);
  });
}
export async function knowledgeSave(id: string, body: unknown) {
  const { expected_revision, ...input } = documentUpdate.parse(body);
  return transaction(async (db) => {
    await lockLibrary(db);
    const current = await knowledgeDocument(id, db);
    requireRevision(current.revision, expected_revision);
    const name = await categoryName(input.category_id, db, current.category_id);
    if (
      input.title === current.title &&
      input.category_id === current.category_id &&
      input.content_md === current.content_md
    )
      return current;
    await execute(
      'UPDATE knowledge_documents SET title=?,category_id=?,content_md=?,revision=revision+1,content_version=content_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',
      [input.title, input.category_id, input.content_md, id],
      db,
    );
    await snapshot(id, current.content_version + 1, input, name, 'edit', db);
    return knowledgeDocument(id, db);
  });
}
export async function knowledgeSetStatus(id: string, body: unknown) {
  const input = documentStatus.parse(body);
  return transaction(async (db) => {
    await lockLibrary(db);
    const current = await knowledgeDocument(id, db);
    requireRevision(current.revision, input.expected_revision);
    if (current.is_active !== input.is_active)
      await execute(
        'UPDATE knowledge_documents SET is_active=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',
        [input.is_active, id],
        db,
      );
    return knowledgeDocument(id, db);
  });
}
export async function knowledgeCategorySave(body: unknown, id?: number) {
  const input = id ? categoryUpdate.parse(body) : categoryInput.parse(body);
  return transaction(async (db) => {
    await lockLibrary(db);
    if (id) {
      const update = categoryUpdate.parse(body);
      const current = (await query('SELECT * FROM knowledge_categories WHERE id=?', [id], db))[0];
      if (!current) throw new AppError(404, 'Categoría no encontrada.');
      requireRevision(current.revision, update.expected_revision);
      await execute(
        'UPDATE knowledge_categories SET name=?,position=?,archived_at=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',
        [
          update.name,
          update.position,
          update.archived ? current.archived_at || new Date() : null,
          id,
        ],
        db,
      );
    } else {
      const result = await execute(
        'INSERT INTO knowledge_categories(name,position) VALUES (?,?)',
        [input.name, input.position],
        db,
      );
      id = result.insertId;
    }
    return (await query('SELECT * FROM knowledge_categories WHERE id=?', [id], db))[0];
  });
}
export async function initializeKnowledge() {
  return transaction(async (db) => {
    const state = await lockLibrary(db);
    if (!state.pillars_initialized_at) {
      // Stable UUIDs scoped to independent installation databases. No cross-installation lookup.
      for (const [index, pillar] of knowledgePillars.entries()) {
        await insertDocument(
          `b677db44-79d5-4ea3-892f-00000000000${index + 1}`,
          { title: pillar.title, category_id: null, content_md: pillar.content_md },
          db,
          pillar.key,
        );
      }
      await execute(
        'UPDATE knowledge_library_state SET pillars_initialized_at=CURRENT_TIMESTAMP(3),pillars_template_version=1 WHERE id=1',
        [],
        db,
      );
    }
    return { initialized: true };
  });
}
export function readMarkdown(buffer: Buffer, filename: string) {
  if (buffer.length > KNOWLEDGE_MAX_BYTES) throw new AppError(413, 'El documento supera 512 KiB.');
  if (!/\.md$/i.test(filename)) throw new AppError(422, 'Seleccioná un archivo .md.');
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new AppError(422, 'El archivo debe estar codificado en UTF-8.');
  }
  return { content_md: markdown.parse(content) };
}
export const knowledge = Router();
knowledge.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
knowledge.get('/state', async (_req, res) =>
  res.json({
    initialized: Boolean(
      (await query('SELECT pillars_initialized_at FROM knowledge_library_state WHERE id=1'))[0]
        ?.pillars_initialized_at,
    ),
  }),
);
knowledge.post('/initialize', async (req, res) => {
  z.object({}).strict().parse(req.body);
  res.json(await initializeKnowledge());
});
knowledge.get('/categories', async (_req, res) =>
  res.json(await query('SELECT * FROM knowledge_categories ORDER BY position,name,id')),
);
knowledge.post('/categories', async (req, res) =>
  res.status(201).json(await knowledgeCategorySave(req.body)),
);
knowledge.put('/categories/:id', async (req, res) =>
  res.json(
    await knowledgeCategorySave(req.body, z.coerce.number().int().positive().parse(req.params.id)),
  ),
);
knowledge.get('/documents', async (req, res) => {
  const filters = documentFilters.parse(req.query);
  const where = ['d.deleted_at IS NULL'];
  const values: any[] = [];
  if (filters.q) {
    where.push('LOCATE(?,d.title)>0');
    values.push(filters.q);
  }
  if (filters.status) {
    where.push('d.is_active=?');
    values.push(filters.status === 'active');
  }
  if (filters.category === 'none') where.push('d.category_id IS NULL');
  else if (filters.category) {
    where.push('d.category_id=?');
    values.push(filters.category);
  }
  const condition = where.join(' AND ');
  const rows = await query(
    `${summary} WHERE ${condition} ORDER BY d.updated_at DESC,d.id LIMIT 30 OFFSET ${(filters.page - 1) * 30}`,
    values,
  );
  const count = (
    await query(`SELECT COUNT(*) total FROM knowledge_documents d WHERE ${condition}`, values)
  )[0];
  res.json({ rows: rows.map(normalize), total: count.total, page: filters.page });
});
knowledge.post('/documents', async (req, res) =>
  res.status(201).json(await knowledgeCreate(req.body)),
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: KNOWLEDGE_MAX_BYTES, files: 1, fields: 0, parts: 1 },
}).single('file');
knowledge.post('/import', (req, res, next) =>
  upload(req, res, (error) => {
    if (error)
      return next(
        new AppError(
          error.code === 'LIMIT_FILE_SIZE' ? 413 : 422,
          error.code === 'LIMIT_FILE_SIZE'
            ? 'El documento supera 512 KiB.'
            : 'Importá un único archivo Markdown.',
        ),
      );
    try {
      if (!req.file) throw new AppError(422, 'Seleccioná un archivo .md.');
      res.json(readMarkdown(req.file.buffer, req.file.originalname));
    } catch (e) {
      next(e);
    }
  }),
);
knowledge.get('/documents/:id', async (req, res) =>
  res.json(await knowledgeDocument(String(req.params.id))),
);
knowledge.put('/documents/:id', async (req, res) =>
  res.json(await knowledgeSave(String(req.params.id), req.body)),
);
knowledge.patch('/documents/:id/status', async (req, res) =>
  res.json(await knowledgeSetStatus(String(req.params.id), req.body)),
);
knowledge.get('/documents/:id/export', async (req, res) => {
  const document = await knowledgeDocument(String(req.params.id));
  res.set('Content-Disposition', `attachment; filename="knowledge-${document.id}.md"`);
  res.set('X-Content-Type-Options', 'nosniff');
  res.type('text/markdown; charset=utf-8').send(document.content_md);
});
