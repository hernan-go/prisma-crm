import { z } from 'zod';
import { markdown, knowledgeRevision } from './knowledge.js';

export const knowledgeQuery = z
  .object({
    id: z.string().uuid().optional(),
    q: z.string().trim().max(240).optional(),
    category: z
      .string()
      .regex(/^[1-9][0-9]{0,9}$/)
      .optional(),
    after: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => !v.id || (!v.q && !v.category && !v.after));
export type KnowledgeQuery = z.infer<typeof knowledgeQuery>;
export const knowledgeMetadata = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(240),
    category_id: z.number().int().positive().nullable(),
    category_name: z.string().max(120).nullable(),
    content_version: knowledgeRevision,
    revision: knowledgeRevision,
    updated_at: z.string().min(1).max(40),
  })
  .strict();
export const knowledgeResponse = z.discriminatedUnion('mode', [
  z
    .object({
      version: z.literal('1.0'),
      mode: z.literal('list'),
      documents: z.array(knowledgeMetadata).max(10),
      next_after: z.string().uuid().nullable(),
    })
    .strict(),
  z
    .object({
      version: z.literal('1.0'),
      mode: z.literal('document'),
      document: knowledgeMetadata.extend({ content_md: markdown }).strict(),
    })
    .strict(),
]);
