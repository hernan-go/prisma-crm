import { Skeleton, SkeletonRegion } from './Skeleton';

export function DashboardFinanceSkeleton() {
  return (
    <SkeletonRegion label="Cargando resumen financiero…" className="dashboard-finance-loading">
      <div className="stats dashboard-stats">
        {[0, 1, 2, 3].map((i) => (
          <article className="stat loading-card" key={i} aria-hidden="true">
            <Skeleton width="80%" height={16} />
            <Skeleton width="65%" height={30} />
            <Skeleton width="60%" height={12} />
          </article>
        ))}
      </div>
      <div className="dashboard-finances">
        {[0, 1].map((i) => (
          <section className="panel loading-card" key={i} aria-hidden="true">
            <Skeleton width="65%" height={20} />
            <Skeleton width="80%" height={26} />
            <Skeleton width="55%" height={14} />
          </section>
        ))}
      </div>
      <section className="panel dashboard-chart loading-card" aria-hidden="true">
        <Skeleton width="60%" height={20} />
        {[80, 60, 40].map((width) => (
          <Skeleton key={width} width={`${width}%`} height={18} />
        ))}
      </section>
    </SkeletonRegion>
  );
}

export function DashboardAgendaSkeleton() {
  return (
    <SkeletonRegion label="Cargando programación…">
      {[0, 1].map((i) => (
        <article className="panel dashboard-schedule loading-card" key={i} aria-hidden="true">
          <Skeleton width="35%" height={12} />
          <Skeleton width="65%" height={20} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="60%" height={14} />
        </article>
      ))}
    </SkeletonRegion>
  );
}
