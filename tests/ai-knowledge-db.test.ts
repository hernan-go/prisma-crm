import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../server/db';
import { readKnowledge } from '../server/integrations/ai-knowledge';

afterAll(() => pool.end());
describe.skipIf(process.env.RUN_AI_KNOWLEDGE_DB_TESTS !== 'true')(
  'knowledge read in local prisma_test',
  () => {
    it('filters active/deleted rows, reads current revisions, paginates and rolls fixtures back', async () => {
      if (
        process.env.DB_NAME !== 'prisma_test' ||
        !['localhost', '127.0.0.1'].includes(process.env.DB_HOST || '127.0.0.1')
      )
        throw Error('Only local prisma_test');
      const db = await pool.getConnection();
      let started = false;
      try {
        const [rows] = await db.query('SELECT DATABASE() db');
        expect((rows as { db: string }[])[0].db).toBe('prisma_test');
        await db.beginTransaction();
        started = true;
        const prefix = `synthetic-${randomUUID()}`;
        const ids = Array.from({ length: 13 }, () => randomUUID()).sort();
        for (let i = 0; i < ids.length; i++)
          await db.execute(
            'INSERT INTO knowledge_documents(id,title,content_md,is_active,deleted_at) VALUES (?,?,?,?,?)',
            [
              ids[i],
              prefix,
              '# synthetic v1',
              i === 11 ? 0 : 1,
              i === 12 ? '2026-10-30 00:00:00' : null,
            ],
          );
        const list = await readKnowledge({ q: prefix }, db);
        expect(list.mode).toBe('list');
        if (list.mode !== 'list') throw Error('list expected');
        expect(list.documents.map((d) => d.id)).toEqual(ids.slice(0, 10));
        expect(list.next_after).toBe(ids[9]);
        expect(JSON.stringify(list)).not.toContain('synthetic v1');
        const next = await readKnowledge({ q: prefix, after: list.next_after! }, db);
        expect(next).toMatchObject({ documents: [{ id: ids[10] }], next_after: null });
        for (const id of [ids[11], ids[12], randomUUID()])
          await expect(readKnowledge({ id }, db)).rejects.toMatchObject({ status: 404 });
        expect(await readKnowledge({ id: ids[0] }, db)).toMatchObject({
          document: { content_md: '# synthetic v1', content_version: 1 },
        });
        await db.execute(
          'UPDATE knowledge_documents SET content_md=?,content_version=2,revision=2 WHERE id=?',
          ['# synthetic v2', ids[0]],
        );
        expect(await readKnowledge({ id: ids[0] }, db)).toMatchObject({
          document: { content_md: '# synthetic v2', content_version: 2, revision: 2 },
        });
        await db.execute('UPDATE knowledge_documents SET is_active=0 WHERE title=?', [prefix]);
        await expect(readKnowledge({ id: ids[0] }, db)).rejects.toMatchObject({ status: 404 });
        expect(await readKnowledge({ q: prefix }, db)).toMatchObject({
          documents: [],
          next_after: null,
        });
      } finally {
        if (started) await db.rollback();
        db.release();
      }
    });
  },
);
