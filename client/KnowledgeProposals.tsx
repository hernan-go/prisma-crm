import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from './api';
import { ErrorBox, Loading } from './components';
import { KnowledgeDialog } from './KnowledgeDialog';
import { knowledgeDiff } from './knowledge-diff';
import type { ProposalReceipt, ProposalReview } from '../shared/knowledge-proposals';

const root = '/knowledge/proposals';
export function ProposalBadge({ count, open }: { count: number; open: () => void }) {
  return count > 0 ? (
    <button
      type="button"
      className="knowledge-pending"
      onClick={(event) => {
        event.stopPropagation();
        open();
      }}
    >
      <span className="knowledge-led" aria-hidden="true" />
      {count} {count === 1 ? 'cambio pendiente' : 'cambios pendientes'}
    </button>
  ) : null;
}
export function ProposalComparison({ before, after }: { before: string; after: string }) {
  const diff = useMemo(() => knowledgeDiff(before, after), [before, after]);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(diff.rows.length / 200));
  const current = Math.min(page, pages - 1);
  return (
    <>
      {pages > 1 && (
        <nav className="proposal-fragments" aria-label="Fragmentos de comparación">
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            Fragmento anterior
          </button>
          <span>
            Fragmento {current + 1} de {pages}
          </span>
          <button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
            Fragmento siguiente
          </button>
        </nav>
      )}
      <div className="proposal-comparison">
        {(['before', 'after'] as const).map((side) => (
          <section
            key={side}
            className={`proposal-panel ${side}`}
            aria-label={side === 'before' ? 'Antes' : 'Después'}
          >
            <h3>{side === 'before' ? 'Antes' : 'Después'}</h3>
            <div className="proposal-scroll" tabIndex={0}>
              {/* Plain React text deliberately preserves Markdown source and never executes HTML. */}
              {!diff.added && !diff.removed && <p>Sin diferencias de contenido.</p>}
              {diff.rows.slice(current * 200, (current + 1) * 200).map((row, i) =>
                row.kind === (side === 'before' ? 'added' : 'removed') ? null : (
                  <div key={i} className={`proposal-line ${row.kind}`}>
                    {row.prefix}
                    {row.kind === 'removed' ? (
                      <del>{row.change ?? (row.text || '\u00a0')}</del>
                    ) : row.kind === 'added' ? (
                      <ins>{row.change ?? (row.text || '\u00a0')}</ins>
                    ) : (
                      row.text || '\u00a0'
                    )}
                    {row.suffix}
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
function Review({
  proposal,
  resolved,
  close,
}: {
  proposal: ProposalReview;
  resolved: () => Promise<void>;
  close: () => void;
}) {
  const qc = useQueryClient();
  const diff = useMemo(() => knowledgeDiff(proposal.before_md, proposal.content_md), [proposal]);
  const decision = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      api<ProposalReceipt>(`${root}/${proposal.proposal_id}/${action}`, 'POST', {
        content_sha256: proposal.content_sha256,
      }),
    onSuccess: resolved,
    onError: () => qc.invalidateQueries({ queryKey: ['knowledge'] }),
  });
  const date = new Date(
    proposal.created_at.includes('T')
      ? proposal.created_at
      : proposal.created_at.replace(' ', 'T') + 'Z',
  );
  return (
    <>
      {diff.section && <span className="proposal-section">Sección afectada: {diff.section}</span>}
      <div className="proposal-metadata">
        <span>
          <strong>Estado:</strong>{' '}
          {proposal.status === 'outdated' ? 'Desactualizada' : 'Pendiente de aprobación'}
        </span>
        <span>
          <strong>Origen:</strong> ChatGPT
        </span>
        <span>
          <strong>Versión base:</strong> {proposal.base_content_version}
        </span>
        <span>{diff.summary}</span>
        <span>
          <strong>Fecha:</strong>{' '}
          {new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'America/Argentina/Buenos_Aires',
          }).format(date)}{' '}
          (ART)
        </span>
        <span>
          <strong>Tipo:</strong> {diff.type}
        </span>
      </div>
      {proposal.status === 'outdated' && (
        <p role="alert">
          El documento cambió desde esta propuesta. No se puede aprobar. Podés rechazarla y
          solicitar una nueva sobre la revisión vigente.
        </p>
      )}
      <ProposalComparison before={proposal.before_md} after={proposal.content_md} />
      <ErrorBox error={decision.error} />
      <div className="proposal-decisions">
        <button
          className="primary"
          disabled={decision.isPending || proposal.status !== 'pending' || !!decision.error}
          onClick={() => decision.mutate('approve')}
        >
          Aprobar y guardar
        </button>
        <button
          className="danger"
          disabled={decision.isPending}
          onClick={() => decision.mutate('reject')}
        >
          Rechazar propuesta
        </button>
        <button type="button" onClick={close}>
          Cerrar
        </button>
      </div>
      <small className="muted">Rechazar elimina definitivamente el contenido propuesto.</small>
    </>
  );
}
export function KnowledgeProposals({
  documentId,
  title,
  close,
  onResolved,
}: {
  documentId: string;
  title: string;
  close: () => void;
  onResolved?: () => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>();
  const list = useQuery({
    queryKey: ['knowledge', 'proposals', documentId],
    queryFn: () => api<ProposalReceipt[]>(`${root}?document_id=${documentId}`),
  });
  const id = list.data?.some((p) => p.proposal_id === selected)
    ? selected
    : list.data?.[0]?.proposal_id;
  const detail = useQuery({
    queryKey: ['knowledge', 'proposal', id],
    queryFn: () => api<ProposalReview>(`${root}/${id}`),
    enabled: !!id,
  });
  const resolved = async () => {
    if (id) qc.removeQueries({ queryKey: ['knowledge', 'proposal', id], exact: true });
    setSelected(undefined);
    await qc.invalidateQueries({ queryKey: ['knowledge'] });
    onResolved?.();
  };
  return (
    <KnowledgeDialog title={title} close={close} className="knowledge-proposal-dialog">
      <button
        className="proposal-x"
        type="button"
        aria-label="Cerrar revisión"
        data-initial-focus
        onClick={close}
      >
        <X size={20} />
      </button>
      <ErrorBox error={list.error || detail.error} />
      {list.isPending && <Loading />}
      {list.data && list.data.length > 1 && (
        <label className="proposal-selector">
          Propuesta a revisar
          <select value={id} onChange={(e) => setSelected(e.target.value)}>
            {list.data.map((p, i) => (
              <option key={p.proposal_id} value={p.proposal_id}>
                Propuesta {i + 1} · versión {p.base_content_version} ·{' '}
                {p.status === 'outdated' ? 'Desactualizada' : 'Pendiente'}
              </option>
            ))}
          </select>
        </label>
      )}
      {id && detail.isPending && <Loading />}
      {id && detail.data && !detail.isError && (
        <Review key={id} proposal={detail.data} resolved={resolved} close={close} />
      )}
      {list.data?.length === 0 && (
        <p role="status">No quedan propuestas pendientes para este documento.</p>
      )}
      {(!id || !detail.data || detail.isError) && (
        <div className="proposal-close">
          <button type="button" onClick={close}>
            Cerrar
          </button>
        </div>
      )}
    </KnowledgeDialog>
  );
}
