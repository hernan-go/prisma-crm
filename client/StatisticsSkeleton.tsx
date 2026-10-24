import { Skeleton, SkeletonRegion } from './Skeleton';

export function StatisticsValueSkeleton() {
  return (
    <div className="statistics-value-skeleton">
      <Skeleton width="72%" height="1.2em" />
      <Skeleton width="52%" height={10} />
    </div>
  );
}

export function StatisticsChartSkeleton({ kind }: { kind: 'collections' | 'expenses' | 'fees' }) {
  const label = {
    collections: 'Cargando cobranzas…',
    expenses: 'Cargando gastos…',
    fees: 'Cargando honorarios…',
  }[kind];
  return (
    <article className={`expense-analysis-tile statistics-chart-skeleton skeleton-${kind}`}>
      <SkeletonRegion label={label}>
        <div className="statistics-skeleton-heading">
          <Skeleton width="38%" height={10} />
          <Skeleton width="68%" height={24} />
        </div>
        {kind === 'fees' ? (
          <div className="statistics-skeleton-fees">
            <div>
              <Skeleton width="85%" height={14} />
              <Skeleton width="65%" height={12} />
            </div>
            <Skeleton circle width="100%" height="100%" />
            <div>
              <Skeleton width="85%" height={14} />
              <Skeleton width="65%" height={12} />
            </div>
          </div>
        ) : kind === 'collections' ? (
          <>
            <Skeleton width="30%" height={40} />
            <div className="statistics-skeleton-bar">
              <Skeleton height={32} />
            </div>
            <div className="statistics-skeleton-values">
              {[0, 1, 2].map((i) => (
                <StatisticsValueSkeleton key={i} />
              ))}
            </div>
          </>
        ) : (
          <div className="statistics-skeleton-expenses">
            {[76, 60, 44, 30, 22].map((width) => (
              <div key={width}>
                <Skeleton width="85%" height={12} />
                <Skeleton width={`${width}%`} height={18} />
              </div>
            ))}
          </div>
        )}
      </SkeletonRegion>
    </article>
  );
}

export function StatisticsExpensesSkeleton() {
  return (
    <div className="expense-analysis-content">
      <div className="statistics-analysis-grid">
        <StatisticsChartSkeleton kind="expenses" />
        <StatisticsChartSkeleton kind="fees" />
      </div>
    </div>
  );
}
