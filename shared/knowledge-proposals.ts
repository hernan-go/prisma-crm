import { z } from 'zod';
import { knowledgeRevision, markdown } from './knowledge.js';

export const proposalId = z.string().uuid();
export const proposalHash = z.string().regex(/^[a-f0-9]{64}$/);
export const proposalInput = z
  .object({
    request_id: proposalId,
    document_id: proposalId,
    expected_revision: knowledgeRevision,
    content_md: markdown.refine(
      (value) =>
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value),
      'El contenido debe ser Unicode válido.',
    ),
    content_sha256: proposalHash,
  })
  .strict();
export const proposalDecision = z.object({ content_sha256: proposalHash }).strict();
export interface ProposalReceipt {
  proposal_id: string;
  request_id: string;
  document_id: string;
  base_revision: number;
  base_content_version: number;
  content_sha256: string;
  status: 'pending' | 'outdated' | 'approved' | 'rejected';
  source: 'chatgpt';
  created_at: string;
  decided_at: string | null;
  decided_by: 'administration' | null;
  result_revision: number | null;
  result_content_version: number | null;
}
export interface ProposalReview extends ProposalReceipt {
  title: string;
  before_md: string;
  content_md: string;
}
