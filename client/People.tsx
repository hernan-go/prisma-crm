import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Upload, ArrowLeft } from 'lucide-react';
import { api } from './api';
import {
  Modal,
  Field,
  SearchBox,
  Loading,
  Empty,
  ErrorBox,
  useDebounce,
  useSave,
  SaveButton,
  DeleteButton,
  PageHeading,
} from './components';
import {
  personSchema,
  formatMoney,
  formatDate,
  sumMoney,
  days,
  recipientLabel,
  paymentMethodLabel,
} from '../shared/domain';
import { usePeriod, periodName } from './App';
import { PersonMonth } from './Management';
export function PersonForm({ person, close }: { person?: any; close: () => void }) {
  const defaults = person ? { ...person, activo: !!person.activo } : {};
  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors },
  } = useForm<any>({ resolver: zodResolver(personSchema) as any, defaultValues: defaults });
  const [matches, setMatches] = useState<any[]>([]);
  const [matchError, setMatchError] = useState<unknown>();
  const findMatches = async () => {
    try {
      setMatchError(undefined);
      const p = getValues();
      setMatches(
        await api('/people/matches', 'POST', {
          telefono: p.telefono || '',
          dni: p.dni || '',
          email: p.email || '',
          exclude: person?.id || 0,
        }),
      );
    } catch (e) {
      setMatchError(e);
    }
  };
  const [allow, setAllow] = useState(false);
  const m = useSave(person ? `/people/${person.id}` : '/people', person ? 'PUT' : 'POST', close);
  const input = (key: string, label: string, type = 'text') => (
    <Field key={key} label={label} error={errors[key]?.message as string}>
      <input
        type={type}
        {...register(key, {
          onBlur: () => {
            if (['telefono', 'dni', 'email'].includes(key)) void findMatches();
          },
          onChange: () => {
            setAllow(false);
          },
        })}
      />
    </Field>
  );
  return (
    <Modal title={person ? 'Editar persona' : 'Nueva persona'} close={close}>
      <form onSubmit={handleSubmit((values) => m.mutate({ ...values, allow_duplicate: allow }))}>
        <p>Nombre, apellido y teléfono son obligatorios.</p>
        <div className="form-grid">
          {input('nombre', 'Nombre *')}
          {input('apellido', 'Apellido *')}
          {input('telefono', 'Teléfono *', 'tel')}
          {input('dni', 'DNI')}
          {input('email', 'Email', 'email')}
          {input('direccion', 'Dirección')}
        </div>
        <ErrorBox error={matchError} />
        {matches.length > 0 && (
          <div className="info">
            <b>Posible duplicado</b>
            {matches.map((p) => (
              <p key={p.id}>
                {p.public_id} {p.nombre} {p.apellido} · Coincidencia: {p.reason} ·{' '}
                <Link target="_blank" to={`/personas/${p.id}`}>
                  Ver persona
                </Link>
              </p>
            ))}
          </div>
        )}
        <Field label="Observaciones">
          <textarea {...register('observaciones')} />
        </Field>
        <details>
          <summary>
            Contacto de emergencia <span className="muted">Opcional</span>
          </summary>
          <div className="form-grid">
            {input('emergency_name', 'Nombre del contacto')}
            {input('emergency_relationship', 'Vínculo')}
            {input('emergency_phone', 'Teléfono de emergencia', 'tel')}
            {input('emergency_notes', 'Observaciones del contacto')}
          </div>
        </details>
        {person && (
          <label className="check">
            <input type="checkbox" {...register('activo')} /> Persona activa
          </label>
        )}
        <ErrorBox error={m.error} />
        {(m.error as any)?.status === 409 && (
          <div className="info">
            <p>
              {(m.error as any).details
                ?.map((p: any) => `${p.public_id} ${p.nombre} ${p.apellido}`)
                .join(', ')}
            </p>
            <label className="check">
              <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />{' '}
              Revisé las coincidencias; guardar igualmente.
            </label>
          </div>
        )}
        <div className="actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <SaveButton pending={m.isPending} />
        </div>
      </form>
    </Modal>
  );
}
export function People() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [create, setCreate] = useState(false);
  const term = useDebounce(search);
  const q = useQuery({
    queryKey: ['people', term, page, archived],
    queryFn: () => api(`/people?q=${encodeURIComponent(term)}&page=${page}&archived=${archived}`),
  });
  const archivedControl = (className = '') => (
    <label className={`check ${className}`}>
      <input
        type="checkbox"
        checked={archived}
        onChange={(e) => {
          setArchived(e.target.checked);
          setPage(1);
        }}
      />{' '}
      Incluir archivadas
    </label>
  );
  return (
    <>
      <PageHeading
        title="BBDD Personas"
        eyebrow="BASE MAESTRA"
        description="Un registro por persona, toda su historia en un lugar."
      >
        <div className="actions desktop-only">
          <Link className="button" to="/importar">
            <Upload size={17} /> Importar
          </Link>
          <button className="primary" onClick={() => setCreate(true)}>
            <Plus size={17} /> Nueva persona
          </button>
        </div>
      </PageHeading>
      <div className="people-mobile-actions mobile-only">
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={17} /> Nueva persona
        </button>
        {archivedControl()}
      </div>
      <div className="toolbar people-toolbar">
        <SearchBox
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
        />
        {archivedControl('desktop-only')}
      </div>
      <Link className="mobile-only mobile-import" to="/importar">
        <Upload size={17} /> Importar personas
      </Link>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <section className="panel table-wrap people-table-panel">
          <table className="people-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Teléfono</th>
                <th className="desktop-only">Email</th>
                <th className="desktop-only">Contacto de emergencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.rows.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      className="person-link"
                      to={`/personas/${p.id}`}
                      title={`${p.apellido}, ${p.nombre}`}
                    >
                      <span>
                        {p.apellido}, {p.nombre}
                      </span>
                    </Link>
                    <small className="desktop-only">{p.public_id}</small>
                  </td>
                  <td>{p.telefono}</td>
                  <td className="desktop-only">{p.email || '—'}</td>
                  <td className="desktop-only">
                    <span className={`chip ${p.emergency_phone ? '' : 'info'}`}>
                      {p.emergency_phone ? 'Contacto cargado' : 'Sin contacto de emergencia'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`chip people-status ${p.activo ? 'status-active' : 'status-archived'}`}
                      role="img"
                      aria-label={p.activo ? 'Activa' : 'Archivada'}
                      title={p.activo ? 'Activa' : 'Archivada'}
                    >
                      <span className="desktop-only">{p.activo ? 'Activa' : 'Archivada'}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!q.data?.rows.length && <Empty>No hay personas para mostrar.</Empty>}
          <div className="pagination">
            <small>{q.data?.total || 0} personas</small>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Anterior
            </button>
            <span>{page}</span>
            <button disabled={page * 40 >= (q.data?.total || 0)} onClick={() => setPage(page + 1)}>
              Siguiente
            </button>
          </div>
        </section>
      )}
      {create && <PersonForm close={() => setCreate(false)} />}
    </>
  );
}
export function PersonPicker({
  onSelect,
  excluded = [],
  actionLabel = 'Seleccionar →',
}: {
  onSelect: (p: any) => void;
  excluded?: number[];
  actionLabel?: string;
}) {
  const [search, setSearch] = useState('');
  const term = useDebounce(search);
  const q = useQuery({
    queryKey: ['pick-person', term],
    queryFn: () => api(`/people?q=${encodeURIComponent(term)}`),
  });
  return (
    <div>
      <SearchBox value={search} onChange={setSearch} />
      <ErrorBox error={q.error} />
      <div className="pick-list">
        {q.data?.rows.map((p: any) => (
          <button key={p.id} disabled={excluded.includes(p.id)} onClick={() => onSelect(p)}>
            <span>
              {p.apellido}, {p.nombre}
              <small>
                {p.public_id} · {p.telefono}
              </small>
            </span>
            <span>{excluded.includes(p.id) ? 'Ya incorporada' : actionLabel}</span>
          </button>
        ))}
        {q.isPending && <Loading />}
        {q.data && !q.data.rows.length && (
          <Empty>No hay coincidencias. Creá la persona desde Personas.</Empty>
        )}
      </div>
    </div>
  );
}
export function PersonDetail() {
  const { id } = useParams();
  const { period } = usePeriod();
  const [edit, setEdit] = useState(false);
  const q = useQuery({ queryKey: ['person', id], queryFn: () => api(`/people/${id}`) });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const p = q.data;
  return (
    <>
      <Link to="/personas" className="back">
        <ArrowLeft size={16} /> Personas
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {p.public_id} ·{' '}
            <span className={`chip ${p.activo ? 'status-active' : 'status-archived'}`}>
              {p.activo ? 'Activa' : 'Archivada'}
            </span>
          </span>
          <h1>
            {p.nombre} {p.apellido}
          </h1>
          <p>
            {p.telefono} {p.email && ` · ${p.email}`}
          </p>
        </div>
        <div className="actions">
          <button onClick={() => setEdit(true)}>Editar persona</button>
          {!!p.activo && <DeleteButton path={`/people/${id}`} label="Archivar" />}
        </div>
      </div>
      <section className="panel">
        <div className="detail-grid">
          <div>
            <small>DNI</small>
            {p.dni || 'Sin cargar'}
          </div>
          <div>
            <small>Dirección</small>
            {p.direccion || 'Sin cargar'}
          </div>
          <div>
            <small>Total abonado histórico</small>
            <b>{formatMoney(sumMoney(p.payments.map((x: any) => x.amount)))}</b>
          </div>
        </div>
        {p.observaciones && <p>{p.observaciones}</p>}
        <details>
          <summary>
            Contacto de emergencia{' '}
            {!p.emergency_phone && <span className="chip info">Sin contacto de emergencia</span>}
          </summary>
          <p>
            {p.emergency_name || 'Sin nombre'} · {p.emergency_relationship || 'Sin vínculo'} ·{' '}
            {p.emergency_phone || 'Sin teléfono'}
          </p>
          <p>{p.emergency_notes}</p>
        </details>
      </section>
      {period ? (
        <PersonMonth person={p} />
      ) : (
        <Empty>Seleccioná un período para gestionar inscripciones y pagos.</Empty>
      )}
      <details className="panel">
        <summary>Historial de inscripciones ({p.history.length})</summary>
        {p.history.map((e: any) => (
          <article className="history-row" key={e.id}>
            <b>
              {periodName(e)} · {e.activity}
            </b>
            <p>
              {e.slots
                .map(
                  (s: any) =>
                    `${days[s.day]} ${s.start}–${s.end} · ${s.instructors.map((i: any) => i.name).join(' + ') || 'Sin facilitadores'}`,
                )
                .join(' · ')}
            </p>
          </article>
        ))}
      </details>
      <details className="panel">
        <summary>Historial de cuentas y pagos ({p.payments.length})</summary>
        {p.accounts.map((a: any) => (
          <p key={a.id}>
            {periodName(a)} · A cobrar: {formatMoney(a.amount_due)} · Abonado: {formatMoney(a.paid)}{' '}
            · Saldo: {formatMoney(a.balance)}
          </p>
        ))}
        {p.payments.map((x: any) => (
          <p key={x.id}>
            {formatDate(x.date)} · {periodName(x)} · {formatMoney(x.amount)} · Receptor:{' '}
            {recipientLabel(x.recipient)} · Medio: {paymentMethodLabel(x.method)}
          </p>
        ))}
      </details>
      {edit && <PersonForm person={p} close={() => setEdit(false)} />}
    </>
  );
}
