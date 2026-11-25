import { Skeleton } from './Skeleton';

// Specific to the seven People columns; no table or query abstraction.
export function PeopleSkeletonRows() {
  return Array.from({ length: 6 }, (_, i) => (
    <tr key={i} className="people-skeleton-row" aria-hidden="true">
      <td>
        <Skeleton width="85%" height={14} />
      </td>
      <td className="desktop-only">
        <Skeleton width="70%" height={12} />
      </td>
      <td className="desktop-only">
        <Skeleton width="85%" height={12} />
      </td>
      <td className="desktop-only">
        <Skeleton width="85%" height={12} />
      </td>
      <td className="desktop-only">
        <Skeleton width="75%" height={18} />
      </td>
      <td>
        <span className="people-skeleton-state">
          <Skeleton circle width={12} height={12} />
        </span>
      </td>
      <td className="whatsapp-cell">
        <Skeleton width={28} height={28} />
      </td>
    </tr>
  ));
}
