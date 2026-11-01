import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, execute, transaction, type Connection } from './db.js';
import { AppError } from './errors.js';
import { knowledgeDocument, knowledgeSaveLocked, lockLibrary } from './knowledge.js';
import {
  proposalInput,
  proposalId,
  proposalDecision,
  type ProposalReceipt,
  type ProposalReview,
} from '../shared/knowledge-proposals.js';

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const receiptFields = `p.proposal_id,p.request_id,p.document_id,p.base_revision,p.base_content_version,
 p.content_sha256,p.status,p.source,p.created_at,p.decided_at,p.decided_by,p.result_revision,p.result_content_version`;
const from = `FROM knowledge_edit_proposals p JOIN knowledge_documents d ON d.id=p.document_id`;
function receipt(row: any): ProposalReceipt {
  const { current_revision, deleted_at, is_active, ...result } = row;
  return {
    ...result,
    status:
      result.status === 'pending' &&
      (current_revision !== result.base_revision || deleted_at || !is_active)
        ? 'outdated'
        : result.status,
  };
}
export async function proposalStatus(id: string, db?: Connection): Promise<ProposalReceipt> {
  const rows = await query(
    `SELECT ${receiptFields},d.revision current_revision,d.deleted_at,d.is_active ${from} WHERE p.proposal_id=?`,
    [proposalId.parse(id)],
    db,
  );
  if (!rows.length) throw new AppError(404, 'Propuesta no disponible.');
  return receipt(rows[0]);
}
export async function receiveProposal(body: unknown) {
  const input = proposalInput.parse(body);
  if (sha256(input.content_md) !== input.content_sha256)
    throw new AppError(422, 'El hash no coincide con el contenido.');
  const digest = sha256(
    JSON.stringify([input.document_id, input.expected_revision, input.content_sha256]),
  );
  return transaction(async (db) => {
    await lockLibrary(db);
    const existing = (
      await query(
        'SELECT proposal_id,request_sha256 FROM knowledge_edit_proposals WHERE request_id=?',
        [input.request_id],
        db,
      )
    )[0];
    // Check durable receipt before current revision, including resolved proposals.
    if (existing) {
      if (existing.request_sha256 !== digest)
        throw new AppError(409, 'El identificador de solicitud ya tiene otro contenido.');
      return proposalStatus(existing.proposal_id, db);
    }
    const current = await knowledgeDocument(input.document_id, db);
    if (!current.is_active) throw new AppError(404, 'Documento no disponible.');
    if (current.revision !== input.expected_revision)
      throw new AppError(409, 'El documento cambió. Consultá la revisión vigente.');
    const count = (
      await query("SELECT COUNT(*) n FROM knowledge_edit_proposals WHERE status='pending'", [], db)
    )[0].n;
    if (count >= 100)
      throw new AppError(
        429,
        'La bandeja de propuestas está completa. Resolvé propuestas antes de enviar otras.',
      );
    const id = randomUUID();
    await execute(
      `INSERT INTO knowledge_edit_proposals(proposal_id,request_id,document_id,base_revision,base_content_version,content_md,content_sha256,request_sha256) VALUES (?,?,?,?,?,?,?,?)`,
      [
        id,
        input.request_id,
        current.id,
        current.revision,
        current.content_version,
        input.content_md,
        input.content_sha256,
        digest,
      ],
      db,
    );
    return proposalStatus(id, db);
  });
}
export async function proposalCounts() {
  return query(
    "SELECT document_id,COUNT(*) pending_count FROM knowledge_edit_proposals WHERE status='pending' GROUP BY document_id ORDER BY document_id",
  );
}
export async function listProposals(documentId: string) {
  return (
    await query(
      `SELECT ${receiptFields},d.revision current_revision,d.deleted_at,d.is_active ${from} WHERE p.document_id=? AND p.status='pending' ORDER BY p.created_at,p.proposal_id LIMIT 100`,
      [proposalId.parse(documentId)],
    )
  ).map(receipt);
}
export async function reviewProposal(id: string): Promise<ProposalReview> {
  // One SELECT keeps comparison and availability from the same snapshot.
  const rows = await query(
    `SELECT ${receiptFields},d.revision current_revision,d.deleted_at,d.is_active,d.title,p.content_md,v.content_md before_md
    ${from} JOIN knowledge_document_versions v ON v.document_id=p.document_id AND v.version=p.base_content_version
    WHERE p.proposal_id=? AND p.status='pending'`,
    [proposalId.parse(id)],
  );
  if (!rows.length) throw new AppError(404, 'Propuesta pendiente no disponible.');
  if (sha256(rows[0].content_md) !== rows[0].content_sha256)
    throw new AppError(409, 'No se pudo verificar la integridad de la propuesta.');
  const { title, before_md, content_md, ...metadata } = rows[0];
  return { ...receipt(metadata), title, before_md, content_md };
}
export async function resolveProposal(id: string, action: 'approve' | 'reject', body: unknown) {
  proposalId.parse(id);
  const decision = proposalDecision.parse(body);
  return transaction(async (db) => {
    await lockLibrary(db);
    const proposal = (
      await query('SELECT * FROM knowledge_edit_proposals WHERE proposal_id=? FOR UPDATE', [id], db)
    )[0];
    if (!proposal) throw new AppError(404, 'Propuesta no disponible.');
    if (proposal.content_sha256 !== decision.content_sha256)
      throw new AppError(409, 'La propuesta no coincide con la revisada.');
    const target = action === 'approve' ? 'approved' : 'rejected';
    if (proposal.status === target) return proposalStatus(id, db);
    if (proposal.status !== 'pending') throw new AppError(409, 'La propuesta ya fue resuelta.');
    let revision: number | null = null;
    let version: number | null = null;
    if (action === 'approve') {
      if (sha256(proposal.content_md) !== proposal.content_sha256)
        throw new AppError(409, 'No se pudo verificar la integridad de la propuesta.');
      const current = await knowledgeDocument(proposal.document_id, db);
      if (!current.is_active || current.revision !== proposal.base_revision)
        throw new AppError(
          409,
          'Propuesta desactualizada. Rechazala y solicitá una nueva sobre la revisión vigente.',
        );
      const saved = await knowledgeSaveLocked(
        current.id,
        {
          title: current.title,
          category_id: current.category_id,
          content_md: proposal.content_md,
          expected_revision: proposal.base_revision,
        },
        db,
      );
      revision = saved.revision;
      version = saved.content_version;
    }
    // Resolved requests retain only a technical receipt. Approved content lives
    // in the existing version history; rejected content has no recovery copy.
    await execute(
      `UPDATE knowledge_edit_proposals SET status=?,content_md=NULL,decided_at=CURRENT_TIMESTAMP(3),decided_by='administration',result_revision=?,result_content_version=? WHERE proposal_id=?`,
      [target, revision, version, id],
      db,
    );
    return proposalStatus(id, db);
  });
}

export const knowledgeProposals = Router();
knowledgeProposals.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Same-origin browser writes only. Missing Origin is rejected, not trusted.
  if (
    !['GET', 'HEAD'].includes(req.method) &&
    (req.get('origin') !== (process.env.APP_URL || 'http://localhost:5173') ||
      req.get('sec-fetch-site') === 'cross-site')
  )
    return res.status(403).json({ message: 'Origen de solicitud no permitido.' });
  next();
});
knowledgeProposals.get('/counts', async (req, res) => {
  z.object({}).strict().parse(req.query);
  res.json(await proposalCounts());
});
knowledgeProposals.get('/', async (req, res) => {
  const { document_id } = z.object({ document_id: proposalId }).strict().parse(req.query);
  res.json(await listProposals(document_id));
});
knowledgeProposals.get('/:id', async (req, res) =>
  res.json(await reviewProposal(String(req.params.id))),
);
knowledgeProposals.post('/:id/approve', async (req, res) =>
  res.json(await resolveProposal(String(req.params.id), 'approve', req.body)),
);
knowledgeProposals.post('/:id/reject', async (req, res) =>
  res.json(await resolveProposal(String(req.params.id), 'reject', req.body)),
);
