import { useEducationFocus } from './education-focus';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { ErrorBox, Field, useDebounce } from './components';
import { AccessConfirmation } from './EducationConfirmation';
import type { EducationSnapshot } from '../shared/education';
type Candidate = {
  userId: string;
  displayName: string;
  status: string;
  personId: number | null;
  enabled: number | null;
};
export function ParticipantBinding({ snapshot }: { snapshot: EducationSnapshot }) {
  const focus = useEducationFocus();
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim());
  const [selected, setSelected] = useState<Candidate>();
  const [confirmed, setConfirmed] = useState(false);
  const [operation, setOperation] = useState<{ userId: string; enabled: boolean }>();
  const [result, setResult] = useState('');
  const client = useQueryClient();
  const candidates = useQuery({
    queryKey: ['/education-access', 'identities', q],
    queryFn: () => api<Candidate[]>(`/education-access/identities?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    retry: false,
  });
  const current = snapshot.participantLink;
  const name = `${snapshot.person.apellido}, ${snapshot.person.nombre} · ${snapshot.person.public_id} · #${snapshot.person.id}`;
  return (
    <section
      ref={focus.root}
      tabIndex={-1}
      aria-label="Vinculación administrativa del participante"
      className="panel education-access"
    >
      <h2>Vinculación administrativa del participante</h2>
      <p>
        Asocia una identidad participante existente a esta persona. No verifica titularidad, no crea
        credenciales ni permite iniciar sesión. La activación y autenticación se implementarán
        después.
      </p>
      {current ? (
        <>
          <p>
            Identidad: {current.displayName} · {current.userId}
          </p>
          <p>
            Vínculo {current.enabled ? 'habilitado' : 'deshabilitado'} · Identidad{' '}
            {current.status === 'enabled' ? 'habilitada' : 'deshabilitada'}. Una identidad
            deshabilitada sigue sin acceso.
          </p>
          <button
            disabled={!snapshot.person.activo && !current.enabled}
            onClick={(event) => {
              focus.capture(event.currentTarget);
              setConfirmed(false);
              setOperation({ userId: current.userId, enabled: !current.enabled });
            }}
          >
            {' '}
            {current.enabled ? 'Deshabilitar vínculo' : 'Rehabilitar el mismo vínculo'}{' '}
          </button>
          <p>
            Los extremos del vínculo son permanentes: deshabilitar no permite reasignar la identidad
            o la persona.
          </p>
          <p>
            Deshabilitar el vínculo deniega la evaluación educativa por ambas fuentes para esta
            identidad, conservando los derechos y las inscripciones.
          </p>
        </>
      ) : (
        <>
          <Field label="Buscar identidad participante por nombre o UUID (mínimo 2 caracteres)">
            <input
              maxLength={100}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(undefined);
                setConfirmed(false);
              }}
            />
          </Field>
          <ErrorBox error={candidates.error} />
          {candidates.isFetching && <p role="status">Buscando identidades…</p>}
          {q.length >= 2 && candidates.isSuccess && !candidates.data.length && (
            <p>
              Sin identidades participantes elegibles. No se crearán ni asociarán cuentas
              automáticamente.
            </p>
          )}
          {q.length >= 2 &&
            !candidates.error &&
            candidates.data?.map((c) => (
              <button
                className="education-person"
                key={c.userId}
                disabled={c.personId !== null}
                onClick={() => {
                  setSelected(c);
                  setConfirmed(false);
                }}
              >
                {c.displayName} · {c.userId} ·{' '}
                {c.status === 'enabled' ? 'Habilitada' : 'Deshabilitada'}
                {c.personId !== null ? ` · Ya reservada para persona #${c.personId}` : ''}
              </button>
            ))}
          {candidates.data?.length === 40 && (
            <p>
              Máximo 40 coincidencias. Refiná la búsqueda; los nombres iguales no identifican a una
              misma persona.
            </p>
          )}
          {selected && (
            <>
              <p>
                Seleccionada explícitamente: {selected.displayName} · {selected.userId}
              </p>
              <button
                disabled={!snapshot.person.activo}
                onClick={(event) => {
                  focus.capture(event.currentTarget);
                  setOperation({ userId: selected.userId, enabled: true });
                }}
              >
                Revisar asociación de identidad
              </button>
            </>
          )}
        </>
      )}
      {result && (
        <p role="status" data-education-result ref={focus.result}>
          {result}
        </p>
      )}
      {operation && (
        <AccessConfirmation
          title="Confirmar vínculo administrativo"
          canConfirm={confirmed}
          command={{
            kind: 'link',
            ...operation,
            personId: snapshot.person.id,
            expectedRevision: snapshot.revision,
            associationConfirmed: true,
          }}
          close={() => {
            setOperation(undefined);
            focus.restore();
          }}
          done={() => {
            focus.restore(true);
            setOperation(undefined);
            setSelected(undefined);
            setResult(
              'Vínculo administrativo confirmado. No se verificó titularidad ni se emitió una sesión.',
            );
            void client.invalidateQueries({ queryKey: ['/education-access'] });
          }}
        >
          <p>Persona: {name}</p>
          <p>Identidad UUID: {operation.userId}</p>
          <p>
            Acción:{' '}
            {operation.enabled
              ? 'habilitar la asociación administrativa'
              : 'deshabilitar la asociación administrativa'}
            . No modifica derechos digitales, inscripciones ni el piloto.
          </p>
          <label className="check">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Revisé ambos identificadores. Esta asociación administrativa no verifica la titularidad.
          </label>
        </AccessConfirmation>
      )}
    </section>
  );
}
