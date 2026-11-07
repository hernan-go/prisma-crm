import { useId, useSyncExternalStore, type ReactNode } from 'react';
const mobileQuery = '(max-width: 640px)';
const subscribe = (listener: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
// Keep each mobile panel's state across period and viewport changes.
export function StatisticsAccordion({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const mobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
  const expanded = !mobile || open;
  return (
    <section className="statistics-monthly-panel">
      <h2 id={id + '-heading'} className="statistics-panel-heading">
        <span aria-hidden="true">{icon}</span>
        {mobile ? (
          <button type="button" aria-expanded={expanded} aria-controls={id} onClick={onToggle}>
            {title}
            <span aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
        ) : (
          title
        )}
      </h2>
      <div id={id} role="region" aria-labelledby={id + '-heading'} hidden={!expanded}>
        {expanded && children}
      </div>
    </section>
  );
}
