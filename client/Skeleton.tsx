import LibrarySkeleton, { type SkeletonProps } from 'react-loading-skeleton';
import type { ReactNode } from 'react';
import 'react-loading-skeleton/dist/skeleton.css';
import './skeleton.css';

// Decorative shapes only. The containing region owns the loading announcement.
export function Skeleton(
  props: Pick<SkeletonProps, 'width' | 'height' | 'circle' | 'borderRadius'>,
) {
  return (
    <span className="skeleton-shape" aria-hidden="true">
      <LibrarySkeleton
        {...props}
        inline
        baseColor="var(--skeleton-base)"
        highlightColor="var(--skeleton-highlight)"
        duration={1.6}
      />
    </span>
  );
}

export function SkeletonRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="skeleton-status" role="status">
        {label}
      </span>
      <div aria-busy="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}
