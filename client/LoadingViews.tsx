import { Skeleton, SkeletonRegion } from './Skeleton';
import { ErrorBox } from './components';
import './loading-views.css';

// Lists of movements and people share the same two-line layout.
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <SkeletonRegion label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="payment-row loading-list-row" key={i} aria-hidden="true">
          <div>
            <Skeleton width="72%" height={16} />
            <Skeleton width="50%" height={12} />
          </div>
          <Skeleton width={60} height={24} />
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function CardsSkeleton({ label, cards = 2 }: { label: string; cards?: number }) {
  return (
    <SkeletonRegion label={label}>
      <div className="enroll-grid">
        {Array.from({ length: cards }, (_, i) => (
          <section className="panel loading-card" key={i} aria-hidden="true">
            <Skeleton width="65%" height={20} />
            <Skeleton width="85%" height={14} />
            <Skeleton width="55%" height={14} />
          </section>
        ))}
      </div>
    </SkeletonRegion>
  );
}

export function QueryFeedback({
  query,
  label,
}: {
  query: { error: unknown; data: unknown; isFetching: boolean; refetch: () => unknown };
  label: string;
}) {
  return (
    <>
      {query.error && (
        <div>
          <ErrorBox error={query.error} />
          <button type="button" onClick={() => void query.refetch()}>
            Reintentar {label}
          </button>
        </div>
      )}
      {query.data !== undefined && query.isFetching && (
        <small role="status">Actualizando {label}…</small>
      )}
    </>
  );
}
