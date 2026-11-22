import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { ErrorBox, Field, Modal, PageTitle, useDebounce } from './components';
import type {
  EducationPerson,
  EducationSnapshot,
  EducationHistory,
  DigitalPreview,
  DigitalRight,
} from '../shared/education';
import './education-access.css';

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
      <Link to="/configuracion">← Configuración</Link>
      <PageTitle
        title="Accesos digitales"
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
    <>
      <ErrorBox error={snapshot.error || history.error} />
      {snapshot.error && <button onClick={() => void refresh()}>Reintentar consulta</button>}
      {snapshot.isFetching && <p role="status">Consultando derechos…</p>}
      {data && (
        <>
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
                  {r.activity} · {statusLabel[r.status]}
                </h4>
                <p>
                  Desde {educationDate(r.startsAt)} hasta {educationDate(r.endsAt)} (fin excluido,
                  UTC−03).
                </p>
                <small>Derecho: {r.id}</small>
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
                      onClick={() => {
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
              <div role="status">
                <p>Operación confirmada · revisión {result.revision}.</p>
                {result.startsAt !== undefined && (
                  <p>
                    Vigencia registrada: {educationDate(result.startsAt)} →{' '}
                    {educationDate(result.endsAt)}. Derecho: {result.rightId}
                  </p>
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
              }}
              done={(r) => {
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
            <article className="education-right" key={o.operationId}>
              <h3>
                {o.result.action === 'grant'
                  ? 'Concesión trimestral'
                  : o.result.action === 'renewal'
                    ? 'Renovación trimestral'
                    : ({
                        digital: 'Concesión / renovación trimestral (recibo anterior)',
                        revoke: 'Revocación',
                        presential: 'Habilitación presencial',
                        link: 'Vinculación de identidad',
                      }[o.kind] ?? o.kind)}
              </h3>
              <p>
                {educationDate(o.createdAt)} · {o.actorName} · Administrador: {o.actorId}
              </p>
              <p>{o.reason}</p>
              <small>Operación / recibo: {o.operationId}</small>
              <p>
                Disciplina:{' '}
                {data?.activities.find((a) => a.id === o.activityId)?.name ??
                  data?.rights.find((r) => r.id === o.rightId)?.activity ??
                  'Vinculación de persona'}
              </p>
              {o.result.startsAt !== undefined && (
                <p>
                  Tramo: {educationDate(o.result.startsAt)} → {educationDate(o.result.endsAt)}
                  <br />
                  Instantes registrados: {new Date(o.result.startsAt).toISOString()} →{' '}
                  {new Date(o.result.endsAt!).toISOString()}
                </p>
              )}
              {o.result.previousEnd !== undefined && (
                <p>Fin anterior: {educationDate(o.result.previousEnd)}</p>
              )}
              {o.paymentDeclared && (
                <p>
                  Pago verificado manualmente · referencia: {o.verificationReference}. Derecho
                  habilitado. Sin cobro contabilizado por este módulo.
                </p>
              )}
              <details>
                <summary>Resultado del recibo administrativo</summary>
                <pre>{JSON.stringify(o.result, null, 2)}</pre>
              </details>
            </article>
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
    </>
  );
}
function AccessConfirmation({
  title,
  command,
  close,
  done,
  children,
}: {
  title: string;
  command: Record<string, unknown>;
  close: () => void;
  done: (r: any) => void;
  children: React.ReactNode;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, unknown>>();
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  async function submit(recover = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    const input = submitted ?? {
      ...command,
      operationId,
      ...(command.kind === 'revoke' ? { reason: reason.trim() } : {}),
    };
    setSubmitted(input);
    try {
      if (recover) {
        const receipt = await api<{ result: any }>(`${root}/operations/${operationId}`);
        done(receipt.result);
      } else done(await api(`${root}/operations`, 'POST', input));
    } catch (e) {
      setError(e as Error);
      setUncertain(recover ? true : !(e instanceof ApiError) || e.status >= 500);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Modal
      title={title}
      close={() => {
        if (!busy.current && !uncertain) close();
      }}
      dirtyOverride={false}
    >
      {children}
      {command.kind === 'revoke' && (
        <Field label="Motivo de revocación">
          <textarea
            required
            maxLength={500}
            disabled={!!submitted}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      )}
      <p>Operación: {operationId}</p>
      <ErrorBox error={error} />
      {uncertain && (
        <p role="alert">
          Resultado incierto. Conservá esta ventana y consultá el recibo o reintentá la misma
          operación. No prepares otra concesión. Si recargás la página, buscá este identificador en
          el historial antes de actuar.
        </p>
      )}
      {error && !uncertain && (
        <p>
          La solicitud fue rechazada. Cerrá esta confirmación, actualizá el estado y revisá
          nuevamente.
        </p>
      )}
      <div className="actions">
        <button disabled={pending || uncertain} onClick={close}>
          Cancelar
        </button>
        {uncertain && (
          <button disabled={pending} onClick={() => void submit(true)}>
            Consultar recibo
          </button>
        )}
        <button
          className="primary"
          disabled={
            pending || (!uncertain && !!error) || (command.kind === 'revoke' && !reason.trim())
          }
          onClick={() => void submit()}
        >
          {pending
            ? 'Procesando…'
            : uncertain
              ? 'Reintentar misma operación'
              : 'Confirmar operación'}
        </button>
      </div>
    </Modal>
  );
}
