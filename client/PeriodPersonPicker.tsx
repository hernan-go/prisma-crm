import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Empty, SearchBox, useDebounce } from './components';
import { ListSkeleton, QueryFeedback } from './LoadingViews';

// Period membership search; preserves the existing picker key and request.
export function PeriodPersonPicker({
  onSelect,
  excluded,
}: {
  onSelect: (person: any) => void;
  excluded: number[];
}) {
  const [search, setSearch] = useState('');
  const term = useDebounce(search);
  const q = useQuery({
    queryKey: ['pick-person', term],
    queryFn: () => api(`/people?q=${encodeURIComponent(term)}`),
  });
  const waiting = search !== term;
  const pending = !waiting && q.isPending;
  const results = useRef<HTMLDivElement>(null);
  const height = useRef(0);
  useLayoutEffect(() => {
    if (!waiting && !pending) height.current = 0;
  }, [waiting, pending]);
  const data = waiting ? undefined : q.data;
  return (
    <div>
      <SearchBox
        value={search}
        onChange={(value) => {
          if (!waiting) height.current = results.current?.getBoundingClientRect().height || 0;
          setSearch(value);
        }}
      />
      {!waiting && <QueryFeedback query={q} label="búsqueda de personas" />}
      <div
        ref={results}
        className="pick-list period-person-results"
        aria-busy={waiting || pending || undefined}
        style={
          (waiting || pending) && height.current > 0
            ? { height: height.current, overflow: 'hidden' }
            : undefined
        }
      >
        {waiting && (
          <small className="period-person-wait" role="status">
            Esperando búsqueda…
          </small>
        )}
        {pending && <ListSkeleton label="Buscando personas…" />}
        {data?.rows.map((p: any) => (
          <button key={p.id} disabled={excluded.includes(p.id)} onClick={() => onSelect(p)}>
            <span>
              <span className="participant-name">
                {p.apellido}, {p.nombre}
              </span>
              <small>
                {p.public_id} · {p.telefono}
              </small>
            </span>
            <span>{excluded.includes(p.id) ? 'Ya incorporada' : 'Agregar al período'}</span>
          </button>
        ))}
        {!waiting && q.isSuccess && data.rows.length === 0 && (
          <Empty>No hay coincidencias. Creá la persona desde Personas.</Empty>
        )}
      </div>
    </div>
  );
}
