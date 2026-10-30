import { query, type Connection } from '../db.js';
import { AppError } from '../errors.js';
import {
  knowledgeQuery,
  knowledgeResponse,
  type KnowledgeQuery,
} from '../../shared/ai-knowledge.js';

const fields =
  'd.id,d.title,d.category_id,c.name category_name,d.content_version,d.revision,d.updated_at';
export async function readKnowledge(input: KnowledgeQuery, db?: Connection) {
  const args = knowledgeQuery.parse(input);
  const from = 'FROM knowledge_documents d LEFT JOIN knowledge_categories c ON c.id=d.category_id';
  const visible = 'd.is_active=1 AND d.deleted_at IS NULL';
  if (args.id) {
    const rows = await query(
      `SELECT ${fields},d.content_md ${from} WHERE ${visible} AND d.id=?`,
      [args.id],
      db,
    );
    if (!rows.length) throw new AppError(404, 'Documento no disponible.');
    return knowledgeResponse.parse({ version: '1.0', mode: 'document', document: rows[0] });
  }
  const filters = [visible];
  const values: string[] = [];
  if (args.q) {
    filters.push('LOCATE(?,d.title)>0');
    values.push(args.q);
  }
  if (args.category) {
    filters.push('d.category_id=?');
    values.push(args.category);
  }
  if (args.after) {
    filters.push('d.id>?');
    values.push(args.after);
  }
  // One bounded SELECT; no Markdown or historical versions in list responses.
  const rows = await query(
    `SELECT ${fields} ${from} WHERE ${filters.join(' AND ')} ORDER BY d.id LIMIT 11`,
    values,
    db,
  );
  return knowledgeResponse.parse({
    version: '1.0',
    mode: 'list',
    documents: rows.slice(0, 10),
    next_after: rows.length > 10 ? rows[9].id : null,
  });
}
