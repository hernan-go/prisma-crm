import { EducationReceiptView } from './EducationReceipt';
import { useEducationFocus } from './education-focus';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { ErrorBox, Field, PageTitle, useDebounce } from './components';
import type {
  EducationPerson,
  EducationSnapshot,
  EducationHistory,
  DigitalPreview,
  DigitalRight,
} from '../shared/education';
import './education-access.css';
import { AccessConfirmation } from './EducationConfirmation';
import { ParticipantBinding } from './ParticipantBinding';

const root = '/education-access';
const statusLabel = {
  active: 'Vigente',
  expired: 'Vencido',
  revoked: 'Revocado',
  scheduled: 'Programado',
};
export const educationDate = (n: number | null | undefined) =>
  n == null
    ? 'Sin vigencia previa'
    : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'Etc/GMT+3' }).format(n);

export function EducationAccess() {
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim());
  const [person, setPerson] = useState<EducationPerson>();
  const people = useQuery({
    queryKey: [root, 'search', q],
    queryFn: () => api<EducationPerson[]>(`${root}/people?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    retry: false,
  });
  return (
    <div className="education-access">
      <PageTitle
        title="Accesos PWA"
        description="Tres meses de acceso al contenido disponible y a las incorporaciones durante ese período. Sin renovación automática."
      />
      <section className="panel">
        <h2>Buscar una persona existente</h2>
        <Field label="Nombre, apellido o identificador CRM (mínimo 2 caracteres)">
          <input maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        {people.isFetching && <p role="status">Buscando…</p>}
        <ErrorBox error={people.error} />
        {q.length >= 2 && people.isSuccess && !people.data.length && <p>Sin coincidencias.</p>}
        {q.length >= 2 &&
          people.data?.map((p) => (
            <button className="education-person" key={p.id} onClick={() => setPerson(p)}>
              {p.apellido}, {p.nombre} · {p.public_id} · #{p.id}
              {!p.activo ? ' · Inactiva' : ''}
            </button>
          ))}
        {people.data?.length === 40 && (
          <p>Se muestran hasta 40 coincidencias. Refiná la búsqueda.</p>
        )}
      </section>
      {person && <PersonAccess key={person.id} personId={person.id} />}
    </div>
  );
}
function PersonAccess({ personId }: { personId: number }) {
  const focus = useEducationFocus();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [activityId, setActivity] = useState(0);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [verified, setVerified] = useState(false);
  const [preview, setPreview] = useState<DigitalPreview>();
  const [revoke, setRevoke] = useState<DigitalRight>();
  const [error, setError] = useState<Error>();
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const [result, setResult] = useState<{
    revision: number;
    rightId?: string;
    startsAt?: number;
    endsAt?: number;
  }>();
  const snapshot = useQuery({
    queryKey: [root, personId],
    queryFn: () => api<EducationSnapshot>(`${root}/people/${personId}`),
    retry: false,
  });
  const history = useQuery({
    queryKey: [root, personId, 'history', page],
    queryFn: () => api<EducationHistory>(`${root}/people/${personId}/history?page=${page}`),
    retry: false,
  });
  const data = snapshot.error ? undefined : snapshot.data;
  const refresh = () => client.invalidateQueries({ queryKey: [root, personId] });
  return (
    <section ref={focus.root} tabIndex={-1} aria-label="Administración educativa de la persona">
      <ErrorBox error={snapshot.error || history.error} />
      {snapshot.error && <button onClick={() => void refresh()}>Reintentar consulta</button>}
      {snapshot.isFetching && <p role="status">Consultando derechos…</p>}
      {data && (
        <>
          <ParticipantBinding snapshot={data} />
          <section className="panel">
            <h2>
              {data.person.apellido}, {data.person.nombre} · {data.person.public_id} · #{personId}
            </h2>
            <p>
              {data.person.activo
                ? 'Persona activa'
                : 'Persona inactiva: no se puede conceder acceso.'}{' '}
              · Revisión {data.revision}
            </p>
            <button onClick={() => void refresh()}>Actualizar estado e historial</button>
            <h3>Fuentes presenciales educativas</h3>
            <p>
              Son independientes del acceso digital. Las inscripciones históricas no habilitan por
              sí solas.
            </p>
            {data.presential.length ? (
              data.presential.map((p) => (
                <p key={p.activityId}>
                  {p.activity} · {p.enabled ? 'Habilitada' : 'Deshabilitada'}
                </p>
              ))
            ) : (
              <p>Sin habilitaciones presenciales educativas registradas.</p>
            )}
            <details>
              <summary>Inscripciones presenciales del CRM ({data.enrollments.length})</summary>
              {data.enrollments.map((e, i) => (
                <p key={i}>
                  {e.activity} · {e.month}/{e.year}
                </p>
              ))}
            </details>
            <h3>Derechos digitales trimestrales</h3>
            {!data.rights.length && <p>Sin derechos digitales.</p>}
            {data.rights.map((r) => (
              <article className="education-right" key={r.id}>
                <h4>
                  {r.activity} · {statusLabel[r.status] ?? 'Estado no reconocido'}
                </h4>
                <p>
                  Desde {educationDate(r.startsAt)} hasta {educationDate(r.endsAt)} (fin excluido,
                  UTC−03).
                </p>
                <details>
                  <summary>Identificador del derecho</summary>
                  <code>{r.id}</code>
                </details>
                {r.revokedAt !== null ? (
                  <p>Revocado: {educationDate(r.revokedAt)}</p>
                ) : (
                  <div className="actions">
                    <button
                      disabled={!data.person.activo}
                      onClick={() => {
                        setActivity(r.activityId);
                        setReference('');
                        setVerified(false);
                        document
                          .getElementById('education-grant')
                          ?.scrollIntoView({ block: 'center' });
                      }}
                    >
                      Renovar esta disciplina
                    </button>
                    <button
                      onClick={(event) => {
                        focus.capture(event.currentTarget);
                        setError(undefined);
                        setReason('');
                        setRevoke(r);
                      }}
                    >
                      Revocar este derecho
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
          <section className="panel" id="education-grant">
            <h2>Conceder o renovar tres meses</h2>
            <p>
              La renovación conserva el tiempo restante no revocado de la disciplina. Cada operación
              requiere una nueva confirmación de pago.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (preparingRef.current) return;
                focus.capture(e.nativeEvent.submitter as HTMLElement | null);
                preparingRef.current = true;
                setPreparing(true);
                setError(undefined);
                setResult(undefined);
                try {
                  setPreview(
                    await api<DigitalPreview>(`${root}/preview`, 'POST', { personId, activityId }),
                  );
                } catch (e) {
                  setError(e as Error);
                } finally {
                  preparingRef.current = false;
                  setPreparing(false);
                }
              }}
            >
              <Field label="Disciplina del catálogo">
                <select
                  required
                  value={activityId || ''}
                  onChange={(e) => setActivity(Number(e.target.value))}
                >
                  <option value="">Seleccionar disciplina</option>
                  {data.activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · #{a.id}
                      {!a.active ? ' (archivada)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Referencia única de verificación manual del pago">
                <input
                  required
                  maxLength={150}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
              <p>
                Usá la misma referencia si recuperás una operación incierta. No incluyas datos
                bancarios ni personales adicionales.
              </p>
              <Field label="Motivo administrativo">
                <textarea
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  required
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                Confirmo que administración verificó manualmente el pago.
              </label>
              <p>
                Esta declaración no concilia bancos ni registra un cobro contable. No se emite
                recibo económico; se conserva un recibo administrativo de habilitación.
              </p>
              <button
                className="primary"
                disabled={
                  !data.person.activo ||
                  preparing ||
                  !verified ||
                  !reference.trim() ||
                  !reason.trim()
                }
              >
                {preparing ? 'Preparando…' : 'Revisar fechas y confirmar'}
              </button>
            </form>
            <ErrorBox error={error} />
            {result && (
              <div role="status" data-education-result ref={focus.result}>
                <p>Operación confirmada · revisión {result.revision}.</p>
                {result.startsAt !== undefined && (
                  <p>
                    Vigencia registrada: {educationDate(result.startsAt)} →{' '}
                    {educationDate(result.endsAt)}.
                  </p>
                )}
                {result.rightId && (
                  <details>
                    <summary>Identificador del derecho</summary>
                    <code>{result.rightId}</code>
                  </details>
                )}
              </div>
            )}
          </section>
          {(preview || revoke) && (
            <AccessConfirmation
              key={preview ? `digital-${preview.revision}` : `revoke-${revoke!.id}`}
              title={preview ? 'Confirmar acceso trimestral' : 'Confirmar revocación'}
              command={
                preview
                  ? {
                      kind: 'digital',
                      personId,
                      activityId: preview.activity.id,
                      expectedRevision: preview.revision,
                      expectedWindow: preview.expectedWindow,
                      verificationReference: reference.trim(),
                      paymentVerified: true,
                      reason: reason.trim(),
                    }
                  : { kind: 'revoke', rightId: revoke!.id, expectedRevision: data.revision }
              }
              close={() => {
                setPreview(undefined);
                setRevoke(undefined);
                focus.restore();
              }}
              done={(r) => {
                focus.restore(true);
                setResult(r);
                setPreview(undefined);
                setRevoke(undefined);
                setReference('');
                setVerified(false);
                setPage(1);
                void refresh();
              }}
            >
              <p>
                <b>
                  {data.person.apellido}, {data.person.nombre} · #{personId}
                </b>
              </p>
              {preview ? (
                <>
                  <p>
                    Disciplina: {preview.activity.name} · #{preview.activity.id}
                  </p>
                  <p>Fin anterior no revocado: {educationDate(preview.previousEnd)}</p>
                  <p>
                    Nuevo tramo: {educationDate(preview.startsAt)} → {educationDate(preview.endsAt)}{' '}
                    (fin excluido, UTC−03).
                  </p>
                  <p>
                    Las horas exactas se fijan al confirmar y constan en el recibo. Si cambia el día
                    o la revisión se pedirá revisar nuevamente.
                  </p>
                  <p>Referencia de pago manual: {reference}</p>
                </>
              ) : (
                <>
                  <p>
                    Revocar únicamente {revoke!.activity}: {educationDate(revoke!.startsAt)} →{' '}
                    {educationDate(revoke!.endsAt)}.
                  </p>
                  <p>
                    Derecho: {revoke!.id}. Se conservan la persona, las inscripciones y las
                    restantes fuentes, incluso la presencial de esta misma disciplina.
                  </p>
                </>
              )}
            </AccessConfirmation>
          )}
        </>
      )}
      <section className="panel">
        <h2>Historial administrativo</h2>
        <p>
          Los vencimientos se evalúan por fecha sin una tarea programada. No generan una operación
          ficticia.
        </p>
        {history.isFetching && <p role="status">Cargando historial…</p>}
        {!history.isFetching && !history.error && !history.data?.rows.length && (
          <p>Sin operaciones registradas.</p>
        )}
        {!history.error &&
          history.data?.rows.map((o) => (
            <EducationReceiptView
              key={o.operationId}
              receipt={o}
              person={data?.person}
              snapshot={data}
            />
          ))}
        <div className="actions">
          <button disabled={page === 1 || history.isFetching} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span>Página {page}</span>
          <button
            disabled={!history.data?.hasMore || history.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      </section>
    </section>
  );
}
