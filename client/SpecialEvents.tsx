import { useState, useRef, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { api, ApiError } from './api';
import { usePeriod, periodName } from './App';
import { PersonForm } from './People';
import { Modal, PageHeading, Empty, ErrorBox, Field, SearchBox, useDebounce } from './components';
import { CardsSkeleton, ListSkeleton, QueryFeedback } from './LoadingViews';
import { formatMoney, formatDate, recipientLabel, paymentMethodLabel } from '../shared/domain';
import {
  eventCreateSchema,
  commercialCollections,
  eventEditSchema,
  eventParticipantSchema,
  eventParticipantEditSchema,
  eventMovementSchema,
  eventVoidSchema,
  eventRescheduleSchema,
  eventDeleteSchema,
  type EventMovement,
  type EventListItem,
  type SpecialEventDetail,
  type EventReceipt,
} from '../shared/special-events';
import { eventRequests, type PendingEventRequest } from './event-requests';
import './special-events.css';

const base = '/special-events';
type Participant = SpecialEventDetail['participants'][number];
type Person = { id: number; nombre: string; apellido: string };
export function argentinaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((key) => parts.find((p) => p.type === key)?.value).join('-');
}
const input = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? '');
const moneyInput = (form: HTMLFormElement, name: string) =>
  input(form, name).trim().replace(',', '.');
function useRequestState() {
  return useSyncExternalStore(
    eventRequests.subscribe,
    eventRequests.getSnapshot,
    eventRequests.getSnapshot,
  );
}

function Recovery({
  done,
}: {
  done: (receipt: EventReceipt, request: PendingEventRequest) => void;
}) {
  const state = useRequestState(),
    qc = useQueryClient();
  const [error, setError] = useState<unknown>();
  const lock = useRef(false);
  if (!state.pending) return error ? <ErrorBox error={error} /> : null;
  return (
    <div className="info event-recovery" role="status">
      <p>
        {state.busy
          ? 'Enviando…'
          : 'Hay un envío sin confirmación. Reintentá el mismo envío para conocer su resultado antes de registrar otro.'}
      </p>
      <ErrorBox error={error} />
      <button
        type="button"
        disabled={state.busy}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          try {
            setError(undefined);
            const request = state.pending!;
            const receipt = await eventRequests.retry();
            await qc.invalidateQueries();
            done(receipt, request);
          } catch (e) {
            setError(e);
            await qc.invalidateQueries({ queryKey: ['special-events'] });
          } finally {
            lock.current = false;
          }
        }}
      >
        Reintentar el mismo envío
      </button>
    </div>
  );
}

export function CommandForm({
  title,
  submitLabel = 'Guardar',
  ready = true,
  formClassName,
  close,
  path,
  method = 'POST',
  revision,
  schema,
  values,
  done,
  children,
}: {
  title: string;
  submitLabel?: string;
  ready?: boolean;
  formClassName?: string;
  close: () => void;
  path: string;
  method?: string;
  revision?: number;
  schema: z.ZodType;
  values: (form: HTMLFormElement) => Record<string, unknown>;
  done: (receipt: EventReceipt) => void;
  children: ReactNode;
}) {
  const [expected] = useState(revision),
    [error, setError] = useState<unknown>(),
    [conflict, setConflict] = useState(false);
  const state = useRequestState(),
    qc = useQueryClient(),
    lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || lock.current || state.pending || conflict) return;
    const payload = {
      ...values(event.currentTarget),
      ...(expected === undefined ? {} : { expected_revision: expected }),
    };
    const parsed = schema.safeParse({
      ...payload,
      request_id: '00000000-0000-4000-8000-000000000001',
    });
    if (!parsed.success) {
      setError(new Error(parsed.error.issues.map((issue) => issue.message).join(' ')));
      return;
    }
    lock.current = true;
    setError(undefined);
    try {
      const receipt = await eventRequests.start(path, method, payload);
      await qc.invalidateQueries();
      done(receipt);
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        await qc.invalidateQueries({ queryKey: ['special-events'] });
      }
    } finally {
      lock.current = false;
    }
  }
  return (
    <Modal title={title} close={close}>
      <form className={formClassName} onSubmit={submit}>
        <fieldset disabled={state.busy || !!state.pending || conflict}>{children}</fieldset>
        <ErrorBox error={error} />
        {conflict && (
          <p className="info">
            No se guardó este envío. Cerrá el formulario y revisá los datos actualizados antes de
            volver a operar.
          </p>
        )}
        <Recovery done={done} />
        <div className="actions">
          <button type="button" onClick={close} disabled={state.busy}>
            Cerrar
          </button>
          {ready && (
            <button
              className="primary"
              type="submit"
              disabled={state.busy || !!state.pending || conflict}
            >
              {state.busy ? 'Guardando…' : submitLabel}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function EventForm({
  event,
  period,
  month,
  close,
  done,
}: {
  event?: SpecialEventDetail;
  period: number;
  month: string;
  close: () => void;
  done: (receipt: EventReceipt) => void;
}) {
  return (
    <CommandForm
      title={event ? 'Editar evento' : 'Nuevo evento'}
      close={close}
      path={event ? `${base}/${event.id}` : base}
      method={event ? 'PATCH' : 'POST'}
      revision={event?.revision}
      schema={event ? eventEditSchema : eventCreateSchema}
      done={done}
      values={(f) => ({
        name: input(f, 'name'),
        description: input(f, 'description'),
        date: input(f, 'date'),
        start_time: input(f, 'start_time'),
        end_time: input(f, 'end_time'),
        price: moneyInput(f, 'price'),
        location: input(f, 'location'),
        notes: input(f, 'notes'),
        ...(event ? {} : { period_id: period }),
      })}
    >
      <div className="form-grid">
        <Field label="Nombre">
          <input name="name" defaultValue={event?.name} maxLength={200} required />
        </Field>
        <Field label="Fecha del evento">
          <input
            name="date"
            type="date"
            defaultValue={event?.date}
            min={`${month}-01`}
            max={`${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()).padStart(2, '0')}`}
            required
          />
        </Field>
        <Field label="Desde">
          <input name="start_time" type="time" defaultValue={event?.start_time} required />
        </Field>
        <Field label="Hasta">
          <input name="end_time" type="time" defaultValue={event?.end_time} required />
        </Field>
        <Field label="Precio general">
          <input name="price" inputMode="decimal" defaultValue={event?.price ?? ''} required />
        </Field>
        <Field label="Lugar">
          <input name="location" maxLength={200} defaultValue={event?.location} />
        </Field>
      </div>
      <Field label="Descripción">
        <textarea name="description" defaultValue={event?.description} maxLength={2000} />
      </Field>
      <Field label="Condiciones y observaciones">
        <textarea name="notes" defaultValue={event?.notes} maxLength={2000} />
      </Field>
      <p className="muted">
        El precio general no cambia los precios ya acordados. Para trasladar de mes, usá
        Reprogramar.
      </p>
    </CommandForm>
  );
}

export function SpecialEvents() {
  const { period, periods } = usePeriod(),
    navigate = useNavigate();
  const [create, setCreate] = useState(false);
  const selected = periods.find((p) => p.id === period),
    state = useRequestState();
  const q = useQuery({
    queryKey: ['special-events', 'list', period],
    queryFn: () => api<EventListItem[]>(`${base}?period_id=${period}`),
    enabled: !!period,
  });
  const month = selected ? `${selected.year}-${String(selected.month).padStart(2, '0')}` : '';
  const done = (receipt: EventReceipt) => {
    setCreate(false);
    navigate(`/eventos/${receipt.id}`);
  };
  return (
    <div className="special-events" key={period}>
      <PageHeading
        title="Eventos Especiales"
        description="Eventos, participantes y cobros del período seleccionado."
      >
        <button
          className="primary"
          disabled={!selected || selected.status !== 'open' || !!state.pending || !!q.error}
          onClick={() => setCreate(true)}
        >
          <Plus size={17} /> Nuevo evento
        </button>
      </PageHeading>
      <Recovery
        done={(receipt, request) =>
          request.path.endsWith('/delete')
            ? setCreate(false)
            : done({
                ...receipt,
                id: Number(/^\/special-events\/(\d+)/.exec(request.path)?.[1] ?? receipt.id),
              })
        }
      />
      {selected?.status === 'closed' && (
        <p className="info">
          Período cerrado: consulta histórica. Reabrilo desde Configuración para modificarlo.
        </p>
      )}
      {!period ? (
        <Empty>Creá o seleccioná un período.</Empty>
      ) : (
        <>
          <QueryFeedback query={q} label="eventos" />
          {q.isPending && <CardsSkeleton label="Cargando eventos…" />}
          {q.data?.length === 0 && <Empty>No hay eventos en este período.</Empty>}
          <div className="event-list">
            {q.data?.map((event) => (
              <article className="panel" key={event.id}>
                <div className="section-heading">
                  <div>
                    <h2>{event.name}</h2>
                    <p>
                      {formatDate(event.date)} · {event.start_time}–{event.end_time}
                    </p>
                  </div>
                  <span className="badge">EVENTO {event.event_number}</span>
                </div>
                <Link className="button" to={`/eventos/${event.id}`}>
                  Abrir ficha
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
      {create && selected?.status === 'open' && (
        <EventForm
          key={period}
          period={period}
          month={month}
          close={() => setCreate(false)}
          done={done}
        />
      )}
    </div>
  );
}

function AddParticipant({ event, close }: { event: SpecialEventDetail; close: () => void }) {
  const [selected, setSelected] = useState<Person | null>(null),
    [search, setSearch] = useState(''),
    [creating, setCreating] = useState(false);
  const [revision] = useState(event.revision);
  const [price, setPrice] = useState(event.price),
    [notes, setNotes] = useState('');
  const term = useDebounce(search);
  const people = useQuery({
    queryKey: ['event-people', term],
    queryFn: () => api<{ rows: Person[] }>(`/people?q=${encodeURIComponent(term)}`),
  });
  const previous = event.participants.find((p) => p.person_id === selected?.id);
  if (creating)
    return (
      <PersonForm
        close={() => setCreating(false)}
        onCreated={(person) => {
          setSelected(person);
          setPrice(event.price);
          setNotes('');
        }}
      />
    );
  return (
    <CommandForm
      title="Agregar participante"
      ready={!!selected}
      formClassName="event-participant-form"
      close={close}
      path={`${base}/${event.id}/participants`}
      revision={revision}
      schema={eventParticipantSchema}
      done={close}
      values={(f) => ({
        person_id: selected?.id ?? 0,
        price: moneyInput(f, 'price'),
        notes: input(f, 'notes'),
      })}
    >
      {selected ? (
        <div className="info event-selected-person">
          <b>
            {selected.apellido}, {selected.nombre}
          </b>{' '}
          <button type="button" onClick={() => setSelected(null)}>
            Cambiar persona
          </button>
        </div>
      ) : (
        <>
          <SearchBox value={search} onChange={setSearch} />
          <QueryFeedback query={people} label="personas" />
          {people.isPending && <ListSkeleton label="Buscando personas…" />}
          <div className="pick-list event-person-results">
            {people.data?.rows.map((person) => (
              <button
                key={person.id}
                type="button"
                disabled={event.participants.some((p) => p.person_id === person.id && p.active)}
                onClick={() => {
                  setSelected(person);
                  const previous = event.participants.find((p) => p.person_id === person.id);
                  setPrice(previous?.price ?? event.price);
                  setNotes(previous?.notes ?? '');
                }}
              >
                <span>
                  {person.apellido}, {person.nombre}
                </span>
                <small>
                  {event.participants.some((p) => p.person_id === person.id)
                    ? event.participants.some((p) => p.person_id === person.id && p.active)
                      ? 'Ya inscripta'
                      : 'Reincorporar · pagos anteriores excluidos'
                    : 'Seleccionar'}
                </small>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setCreating(true)}>
            <Plus size={16} /> Crear nueva persona
          </button>
        </>
      )}
      {selected && (
        <>
          <Field label="Precio individual">
            <input
              name="price"
              inputMode="decimal"
              value={price}
              readOnly={!!previous}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </Field>
          <p className="muted">Cero para una cortesía. Incorporar no registra ningún pago.</p>
          {previous && (
            <p className="info">
              Se recuperan el precio y las condiciones anteriores, sin restaurar pagos. Podés editar
              la participación después de reincorporarla.
            </p>
          )}
          <Field label="Condiciones individuales">
            <textarea
              name="notes"
              value={notes}
              readOnly={!!previous}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </Field>
        </>
      )}
    </CommandForm>
  );
}

function ParticipantForm({
  event,
  person,
  active = !!person.active,
  close,
}: {
  event: SpecialEventDetail;
  person: Participant;
  active?: boolean;
  close: () => void;
}) {
  return (
    <CommandForm
      title={
        active !== !!person.active
          ? active
            ? 'Reincorporar participante'
            : 'Eliminar inscripción'
          : 'Editar participación'
      }
      close={close}
      path={`${base}/${event.id}/participants/${person.id}`}
      method="PATCH"
      revision={event.revision}
      schema={eventParticipantEditSchema}
      done={close}
      submitLabel={active ? 'Guardar' : 'Eliminar inscripción'}
      values={(f) => ({
        price: active ? moneyInput(f, 'price') : person.price,
        notes: active ? input(f, 'notes') : person.notes,
        active,
      })}
    >
      <p>
        <b>
          {person.apellido}, {person.nombre}
        </b>
      </p>
      {!active && (
        <>
          <p>Total cobrado vigente que dejará de computar: {formatMoney(person.paid)}</p>
          {Number(person.paid) > 0 && (
            <p className="info">
              Los cobros se excluirán de sus receptores y medios originales. PRISMA se
              responsabiliza de devolver íntegramente el dinero por fuera del sistema.
            </p>
          )}
        </>
      )}
      {active && (
        <>
          <Field label="Precio individual">
            <input name="price" inputMode="decimal" defaultValue={person.price} required />
          </Field>
          <Field label="Condiciones individuales">
            <textarea name="notes" defaultValue={person.notes} maxLength={2000} />
          </Field>
        </>
      )}
    </CommandForm>
  );
}

function MovementForm({
  event,
  person,
  movement,
  close,
}: {
  event: SpecialEventDetail;
  person: Participant;
  movement?: EventMovement;
  close: () => void;
}) {
  return (
    <CommandForm
      title={movement ? 'Editar cobro' : 'Registrar cobro'}
      close={close}
      path={
        movement
          ? `${base}/${event.id}/movements/${movement.id}`
          : `${base}/${event.id}/participants/${person.id}/movements`
      }
      method={movement ? 'PATCH' : 'POST'}
      revision={event.revision}
      schema={eventMovementSchema}
      done={close}
      values={(f) => ({
        kind: 'collection',
        date: input(f, 'date'),
        amount: moneyInput(f, 'amount'),
        recipient: input(f, 'recipient'),
        method: input(f, 'method'),
        notes: input(f, 'notes'),
      })}
    >
      <p>
        <b>
          {person.apellido}, {person.nombre}
        </b>{' '}
        · Pendiente: {formatMoney(person.pending)}
      </p>
      <div className="form-grid">
        <Field label="Fecha efectiva">
          <input
            name="date"
            type="date"
            defaultValue={movement?.date ?? argentinaDate()}
            required
          />
        </Field>
        <Field label="Importe">
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={movement?.amount ?? (person.pending === '0.00' ? '' : person.pending)}
            required
          />
        </Field>
        <Field label="Receptor">
          <select name="recipient" defaultValue={movement?.recipient ?? ''} required>
            <option value="" disabled>
              Seleccionar
            </option>
            <option value="jesica">Jésica</option>
            <option value="hernan">Hernán</option>
          </select>
        </Field>
        <Field label="Medio">
          <select name="method" defaultValue={movement?.method ?? ''} required>
            <option value="" disabled>
              Seleccionar
            </option>
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </select>
        </Field>
      </div>
      <Field label="Observaciones">
        <textarea name="notes" defaultValue={movement?.notes} maxLength={2000} />
      </Field>
    </CommandForm>
  );
}

function DeleteEventForm({
  event,
  close,
  done,
}: {
  event: SpecialEventDetail;
  close: () => void;
  done: () => void;
}) {
  const preview = useQuery({
    queryKey: ['event-delete-preview', event.id, event.revision],
    queryFn: () =>
      api<{ reopen_periods: { id: number; year: number; month: number }[] }>(
        base + '/' + event.id + '/deletion-preview',
      ),
  });
  if (!preview.data)
    return (
      <Modal title="Eliminar evento" close={close}>
        <QueryFeedback query={preview} label="condiciones de eliminación" />
        {preview.isPending && <p>Verificando gastos y períodos…</p>}
      </Modal>
    );
  const periods = preview.data.reopen_periods;
  return (
    <CommandForm
      submitLabel="Eliminar evento"
      title="Eliminar evento"
      close={close}
      done={done}
      path={base + '/' + event.id + '/delete'}
      revision={event.revision}
      schema={eventDeleteSchema}
      values={(f) => ({
        reason: input(f, 'reason'),
        reopen_period_ids: periods
          .filter((p) => input(f, 'reopen-' + p.id) === 'on')
          .map((p) => p.id),
      })}
    >
      <p>¿Eliminar {event.name}?</p>
      <p>
        {event.active_count}{' '}
        {event.active_count === 1 ? 'participante activo' : 'participantes activos'} ·{' '}
        {event.participants.length}{' '}
        {event.participants.length === 1
          ? 'participante histórico registrado'
          : 'participantes históricos registrados'}{' '}
        · {event.expenses?.length ?? 0}{' '}
        {(event.expenses?.length ?? 0) === 1 ? 'gasto asociado' : 'gastos asociados'}.
      </p>
      {Number(event.gross) > 0 && (
        <p className="info">
          {formatMoney(event.gross)} en cobros vigentes dejarán de computar en sus Carteras
          originales y el total recaudado. PRISMA se responsabiliza de la devolución efectiva del
          dinero.
        </p>
      )}
      <p>Los gastos reales se conservarán como gastos generales en el período de su fecha real.</p>
      {periods.map((p) => (
        <label key={p.id}>
          <input type="checkbox" name={'reopen-' + p.id} required /> Autorizo reabrir temporalmente{' '}
          {p.year}-{String(p.month).padStart(2, '0')} exclusivamente para trasladar estos gastos y
          restaurar su estado cerrado.
        </label>
      ))}
      <Field label="Motivo (opcional)">
        <textarea name="reason" maxLength={2000} />
      </Field>
    </CommandForm>
  );
}

function RescheduleForm({
  event,
  close,
  done,
}: {
  event: SpecialEventDetail;
  close: () => void;
  done: (receipt: EventReceipt) => void;
}) {
  const { periods } = usePeriod();
  const [target, setTarget] = useState(event.period_id);
  return (
    <CommandForm
      title="Reprogramar evento"
      close={close}
      path={`${base}/${event.id}/reschedule`}
      revision={event.revision}
      schema={eventRescheduleSchema}
      done={done}
      values={(f) => ({
        period_id: Number(input(f, 'period_id')),
        date: input(f, 'date'),
        start_time: input(f, 'start_time'),
        end_time: input(f, 'end_time'),
        reason: input(f, 'reason'),
      })}
    >
      <p>
        Se conservan participantes y pagos, con sus fechas reales. El período destino debe existir y
        estar abierto.
      </p>
      <Field label="Período destino">
        <select
          name="period_id"
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          required
        >
          {periods
            .filter((p) => p.status === 'open')
            .map((p) => (
              <option value={p.id} key={p.id}>
                {periodName(p)}
              </option>
            ))}
        </select>
      </Field>
      <p className="info">
        Los gastos conservan su período, fecha e importe. Revisá su asociación desde Gastos Período
        si corresponde.
      </p>
      <div className="form-grid">
        <Field label="Nueva fecha">
          <input name="date" type="date" defaultValue={event.date} required />
        </Field>
        <Field label="Desde">
          <input name="start_time" type="time" defaultValue={event.start_time} required />
        </Field>
        <Field label="Hasta">
          <input name="end_time" type="time" defaultValue={event.end_time} required />
        </Field>
      </div>
      <Field label="Motivo">
        <textarea name="reason" maxLength={2000} required />
      </Field>
    </CommandForm>
  );
}

type Dialog =
  | { kind: 'edit' | 'add' | 'reschedule' | 'delete' }
  | { kind: 'participant'; person: Participant; active: boolean }
  | { kind: 'payments'; person: Participant }
  | { kind: 'movement'; person: Participant; movement?: EventMovement }
  | { kind: 'void'; movement: EventMovement };
export function EventIndicators({ event }: { event: SpecialEventDetail }) {
  return (
    <div className="event-indicators" aria-label="Indicadores del evento">
      {[
        ['Participantes', event.active_count],
        ['Total a cobrar', formatMoney(event.due)],
        ['Total cobrado', formatMoney(event.gross)],
      ].map(([label, value]) => (
        <article className="event-indicator" key={label}>
          <h3>{label}</h3>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}
export function SpecialEventPage() {
  const { id } = useParams();
  return <EventDetailPage key={id} id={Number(id)} />;
}
function EventDetailPage({ id }: { id: number }) {
  const { period, periods, selectPeriod } = usePeriod();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const state = useRequestState();
  const q = useQuery({
    queryKey: ['special-events', 'detail', id],
    queryFn: () => api<SpecialEventDetail>(base + '/' + id),
    enabled: Number.isSafeInteger(id) && id > 0,
  });
  if (!Number.isSafeInteger(id) || id <= 0) return <Empty>Evento no válido.</Empty>;
  if (q.isPending) return <ListSkeleton label="Cargando evento…" />;
  if (q.error || !q.data) return <QueryFeedback query={q} label="evento" />;
  const event = q.data,
    selected = periods.find((p) => p.id === event.period_id),
    close = () => setDialog(null);
  if (event.status === 'cancelled')
    return (
      <Empty>
        El evento fue eliminado. <Link to="/eventos">Volver a eventos</Link>
      </Empty>
    );
  const writable =
    selected?.status === 'open' && period === event.period_id && !state.pending && !q.isFetching;
  const people = event.participants.filter((p) => p.active);
  return (
    <div className="special-events">
      <PageHeading title="Eventos Especiales" description="Participantes y cobros del período.">
        <Link to="/eventos" className="button">
          <ArrowLeft size={16} /> Volver a eventos
        </Link>
      </PageHeading>
      <Recovery
        done={(_receipt, request) =>
          request.path.endsWith('/delete') ? navigate('/eventos') : close()
        }
      />
      <EventIndicators event={event} />
      <section className="panel event-summary">
        <h2>{event.name}</h2>
        <span className="badge">EVENTO {event.event_number}</span>
        <p>
          {formatDate(event.date)} · {event.start_time}–{event.end_time}
          {event.location ? ' · ' + event.location : ''}
        </p>
        {event.description && <p>{event.description}</p>}
        {event.notes && <p>{event.notes}</p>}
        <p>Precio general sugerido: {formatMoney(event.price)}</p>
        <div className="actions">
          <button disabled={!writable} onClick={() => setDialog({ kind: 'edit' })}>
            Editar evento
          </button>
          <button disabled={!writable} onClick={() => setDialog({ kind: 'reschedule' })}>
            Reprogramar
          </button>
          <button disabled={!writable} onClick={() => setDialog({ kind: 'delete' })}>
            Eliminar evento
          </button>
        </div>
      </section>
      {selected?.status === 'closed' && (
        <p className="info">
          Período cerrado: solo consulta. Reabrilo desde Configuración para modificarlo.
        </p>
      )}
      {period !== event.period_id && (
        <p className="info">
          Este evento pertenece a {periodName(selected)}.{' '}
          <button onClick={() => selectPeriod?.(event.period_id)}>Seleccionar su período</button>
        </p>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>Participantes</h2>
          <button
            className="primary"
            disabled={!writable}
            onClick={() => setDialog({ kind: 'add' })}
          >
            <Plus size={16} /> Agregar participante
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Participante</th>
                <th>Precio individual</th>
                <th>Cobrado</th>
                <th>Pendiente</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td data-label="Participante">
                    {p.apellido}, {p.nombre}
                  </td>
                  <td data-label="Precio individual">{formatMoney(p.price)}</td>
                  <td data-label="Cobrado">{formatMoney(p.paid)}</td>
                  <td data-label="Pendiente">{formatMoney(p.pending)}</td>
                  <td data-label="Acciones">
                    <div className="actions">
                      <button
                        onClick={() =>
                          setDialog({
                            kind: commercialCollections(event.movements).some(
                              (m) => m.participant_id === p.id && Number(m.amount) > 0,
                            )
                              ? 'payments'
                              : 'movement',
                            person: p,
                          })
                        }
                      >
                        Cobros
                      </button>
                      <button
                        disabled={!writable}
                        onClick={() => setDialog({ kind: 'participant', person: p, active: true })}
                      >
                        Editar precio
                      </button>
                      <button
                        disabled={!writable}
                        onClick={() => setDialog({ kind: 'participant', person: p, active: false })}
                      >
                        Eliminar inscripción
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!people.length && <Empty>Sin participantes.</Empty>}
      </section>
      <section className="panel">
        <h2>Gastos asociados</h2>
        <p>
          Total de gastos directos: {formatMoney(event.direct_expenses ?? '0.00')}. No se descuentan
          de los cobros ni de la deuda de participantes.
        </p>
        {event.expenses?.map((e) => (
          <p key={e.id}>
            {e.concept} · {formatDate(e.date)} · {formatMoney(e.amount)}
          </p>
        ))}
        <Link to="/publicidad">Administrar en Gastos Período →</Link>
      </section>
      {dialog?.kind === 'edit' && (
        <EventForm
          event={event}
          period={event.period_id}
          month={event.date.slice(0, 7)}
          close={close}
          done={close}
        />
      )}
      {dialog?.kind === 'add' && <AddParticipant event={event} close={close} />}
      {dialog?.kind === 'participant' && (
        <ParticipantForm
          event={event}
          person={dialog.person}
          active={dialog.active}
          close={close}
        />
      )}
      {dialog?.kind === 'movement' && (
        <MovementForm
          event={event}
          person={dialog.person}
          movement={dialog.movement}
          close={close}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteEventForm event={event} close={close} done={() => navigate('/eventos')} />
      )}
      {dialog?.kind === 'reschedule' && (
        <RescheduleForm
          event={event}
          close={close}
          done={() => {
            close();
            void q.refetch().then((r) => {
              if (r.data) selectPeriod?.(r.data.period_id);
            });
          }}
        />
      )}
      {dialog?.kind === 'payments' && (
        <Modal
          title={'Cobros · ' + dialog.person.apellido + ', ' + dialog.person.nombre}
          close={close}
        >
          <button
            className="primary"
            disabled={!writable}
            onClick={() => setDialog({ kind: 'movement', person: dialog.person })}
          >
            Registrar cobro
          </button>
          {commercialCollections(event.movements)
            .filter((m) => m.participant_id === dialog.person.id && Number(m.amount) > 0)
            .map((m) => (
              <article className="event-person" key={m.id}>
                <div>
                  {formatDate(m.date)} · {formatMoney(m.amount)}
                  <small>
                    {recipientLabel(m.recipient)} · {paymentMethodLabel(m.method)}
                  </small>
                </div>
                <div className="actions">
                  <button
                    disabled={!writable}
                    onClick={() =>
                      setDialog({ kind: 'movement', person: dialog.person, movement: m })
                    }
                  >
                    Editar
                  </button>
                  <button
                    disabled={!writable}
                    onClick={() => setDialog({ kind: 'void', movement: m })}
                  >
                    Eliminar
                  </button>
                </div>
              </article>
            ))}
        </Modal>
      )}
      {dialog?.kind === 'void' && (
        <CommandForm
          submitLabel="Eliminar cobro"
          title="Eliminar cobro"
          close={close}
          done={close}
          path={base + '/' + event.id + '/movements/' + dialog.movement.id + '/void'}
          revision={event.revision}
          schema={eventVoidSchema}
          values={() => ({ reason: 'Eliminación administrativa de cobro' })}
        >
          <p>
            ¿Eliminar el cobro de {formatMoney(dialog.movement.amount)}? Dejará de computar en el
            receptor y medio originales.
          </p>
        </CommandForm>
      )}
    </div>
  );
}
