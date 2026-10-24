import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Keep visited charts mounted through collapse so their measured height can animate.
// Opening flags live in Statistics, surviving the summary's loading state on month changes.
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
  const [visited, setVisited] = useState(open);
  const [transitioning, setTransitioning] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current!;
    const inner = innerRef.current!;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lastTarget = -1;
    const resize = (force = false) => {
      const target = open ? inner.getBoundingClientRect().height : 0;
      if (!force && Math.abs(target - lastTarget) < 0.5) return;
      lastTarget = target;
      // Measure before cancelling: reversals and newly rendered charts start at the
      // currently visible height, never at a stale loading placeholder's height.
      const current = panel.getBoundingClientRect().height;
      animationRef.current?.cancel();
      panel.style.height = `${target}px`;
      if (motion.matches || Math.abs(current - target) < 0.5 || !panel.animate) {
        setTransitioning(false);
        return;
      }
      setTransitioning(true);
      const animation = panel.animate([{ height: `${current}px` }, { height: `${target}px` }], {
        duration: 500,
        easing: 'ease-in-out',
      });
      animationRef.current = animation;
      animation.onfinish = () => {
        if (animationRef.current !== animation) return;
        // Retain the measured height. With height:auto, late content would jump
        // the panel before ResizeObserver could animate to its new size.
        panel.style.height = `${target}px`;
        animationRef.current = null;
        setTransitioning(false);
      };
    };
    resize();
    const observer = new ResizeObserver(() => resize());
    observer.observe(inner);
    const preferenceChanged = () => resize(true);
    motion.addEventListener('change', preferenceChanged);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', preferenceChanged);
      const current = panel.getBoundingClientRect().height;
      animationRef.current?.cancel();
      animationRef.current = null;
      panel.style.height = `${current}px`;
    };
  }, [open, visited]);
  return (
    <div className="statistics-accordion">
      <h2 className="expense-accordion-heading">
        <button
          id={`${id}-button`}
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setVisited(true);
            onToggle();
          }}
        >
          <span className="expense-accordion-icon">{icon}</span>
          <span className="expense-accordion-title">{title}</span>
          <span className="expense-accordion-toggle" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
      </h2>
      <div
        ref={panelRef}
        id={id}
        role="region"
        aria-labelledby={`${id}-button`}
        aria-hidden={!open}
        inert={!open}
        className="statistics-accordion-panel"
        data-open={open}
        data-transitioning={transitioning}
      >
        <div ref={innerRef} className="statistics-accordion-inner">
          {(open || visited) && children}
        </div>
      </div>
    </div>
  );
}
