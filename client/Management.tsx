export { Configuration } from './Configuration';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from './api';
import {
  Field,
  Modal,
  Empty,
  Loading,
  ErrorBox,
  useSave,
  SaveButton,
  DeleteButton,
  PageHeading,
} from './components';
import { PeriodPersonPicker } from './PeriodPersonPicker';
import { usePeriod, periodName } from './App';
import { Skeleton, SkeletonRegion } from './Skeleton';
import { CardsSkeleton, ListSkeleton, QueryFeedback } from './LoadingViews';
import {
  days,
  times,
  formatMoney,
  formatDate,
  recipientLabel,
  paymentMethodLabel,
  enrollmentSchema,
  paymentSchema,
  type Payment,
} from '../shared/domain';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
function useData(key: string, path: string, enabled = true) {
  return useQuery({ queryKey: [key, path], queryFn: () => api(path), enabled });
}
function Heading({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <PageHeading title={title} description={sub}>
      {children}
    </PageHeading>
  );
}
export function Monthly() {
  const { period, periods } = usePeriod();
  return (
    <MonthlyPeriod
      key={period}
      period={period}
      closed={periods.find((p) => p.id === period)?.status === 'closed'}
    />
  );
}
function MonthlyPeriod({ period, closed }: { period: number | undefined; closed?: boolean }) {
  const [person, setPerson] = useState<any>();
  const [adding, setAdding] = useState(false);
  const members = useData('memberships', `/periods/${period}/memberships`, !!period);
  const add = useSave(`/periods/${period}/memberships`, 'POST', () => setAdding(false));
  return (
    <>
      <Heading
        title="Inscriptos Período"
        sub="Personas incorporadas explícitamente al período seleccionado."
      >
        <button className="primary" disabled={!period || closed} onClick={() => setAdding(true)}>
          <Plus size={17} /> Agregar persona
        </button>
      </Heading>
      {!period ? (
        <Empty>Creá o seleccioná un período.</Empty>
      ) : (
        <>
          {closed && (
            <p className="info">
              Período cerrado: consulta histórica. Reabrilo para agregar o quitar personas.
            </p>
          )}
          {person ? (
            <div className="selected-person">
              <div>
                <Link className="participant-name" to={`/personas/${person.id}`}>
                  {person.nombre} {person.apellido}
                </Link>
                <small>
                  {person.public_id} · {person.telefono}
                </small>
              </div>
              <button onClick={() => setPerson(undefined)}>Volver a personas del período</button>
            </div>
          ) : (
            <section className="panel">
              <h2>Personas inscriptas</h2>
              <QueryFeedback query={members} label="personas inscriptas" />
              {members.isPending && <ListSkeleton label="Cargando personas inscriptas…" />}
              {members.data?.map((p: any) => (
                <div className="payment-row" key={p.membership_id}>
                  <div>
                    <Link className="participant-name" to={`/personas/${p.id}`}>
                      {p.nombre} {p.apellido}
                    </Link>
                    <small>
                      {p.activities || 'Sin actividades asignadas'}
                      {!p.activo && ' · Archivada'}
                    </small>
                  </div>
                  <div className="actions">
                    <button onClick={() => setPerson(p)}>Gestionar</button>
                    <RemoveMembership person={p} period={period} disabled={closed} />
                  </div>
                </div>
              ))}
              {members.isSuccess && members.data?.length === 0 && (
                <Empty>No hay personas inscriptas en este período.</Empty>
              )}
            </section>
          )}
          {person && <PersonMonth person={person} />}
          {adding && (
            <Modal title="Buscar en BBDD" close={() => setAdding(false)}>
              <PeriodPersonPicker
                excluded={members.data?.map((p: any) => p.id) || []}
                onSelect={(p) => {
                  if (!add.isPending) add.mutate({ person_id: p.id });
                }}
              />
              <ErrorBox error={add.error} />
              {add.isPending && <Loading />}
            </Modal>
          )}
        </>
      )}
    </>
  );
}
export function PersonMonth({ person }: { person: any }) {
  const { period } = usePeriod();
  const membership = useData(
    'memberships',
    `/periods/${period}/memberships?person_id=${person.id}`,
    !!period,
  );
  const add = useSave(`/periods/${period}/memberships`, 'POST', () => {});
  const { periods } = usePeriod();
  if (!period) return <Empty>Creá o seleccioná un período.</Empty>;
  if (membership.isPending)
    return <ListSkeleton label="Cargando pertenencia al período…" rows={1} />;
  if (membership.error && !membership.data)
    return <QueryFeedback query={membership} label="pertenencia al período" />;
  if (!membership.data?.length)
    return (
      <section className="panel">
        <QueryFeedback query={membership} label="pertenencia al período" />
        <p>Esta persona no está incorporada al período seleccionado.</p>
        <button
          disabled={
            !person.activo ||
            periods.find((p) => p.id === period)?.status === 'closed' ||
            add.isPending
          }
          onClick={() => add.mutate({ person_id: person.id })}
        >
          Agregar al período
        </button>
        <ErrorBox error={add.error} />
      </section>
    );
  return (
    <>
      <QueryFeedback query={membership} label="pertenencia al período" />
      <PersonMonthMember key={`${period}-${person.id}`} person={person} />
    </>
  );
}
function RemoveMembership({
  person,
  period,
  disabled,
}: {
  person: any;
  period: number;
  disabled?: boolean;
}) {
  const [ask, setAsk] = useState(false);
  const remove = useSave(`/periods/${period}/memberships/${person.membership_id}`, 'DELETE', () =>
    setAsk(false),
  );
  return (
    <>
      <button disabled={disabled} className="danger subtle" onClick={() => setAsk(true)}>
        Quitar del período
      </button>
      {ask && (
        <Modal title="Quitar del período" close={() => setAsk(false)}>
          <p>
            Se quitará únicamente la pertenencia de{' '}
            <span className="participant-name">
              {person.nombre} {person.apellido}
            </span>{' '}
            a este período. La persona seguirá en BBDD. Si existe una cuenta mensual completamente
            vacía (sin importe definido y sin pagos), se eliminará automáticamente. Si tiene
            actividades, pagos o un importe a cobrar definido, incluido cero, la operación se
            bloqueará.
          </p>
          <ErrorBox error={remove.error} />
          <div className="actions">
            <button onClick={() => setAsk(false)}>Cancelar</button>
            <button
              className="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              Quitar del período
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function PersonMonthMember({ person }: { person: any }) {
  const { period, periods } = usePeriod();
  const q = useData(
    'enrollments',
    `/enrollments?period_id=${period}&person_id=${person.id}`,
    !!period,
  );
  const a = useData('accounts', `/accounts?period_id=${period}&person_id=${person.id}`, !!period);
  const payments = useData('payments', `/payments?period_id=${period}`, !!period);
  const [enroll, setEnroll] = useState<any>();
  const [payment, setPayment] = useState<any>();
  const [due, setDue] = useState(false);
  const closed = periods.find((p) => p.id === period)?.status === 'closed';
  const account = a.data?.[0];
  const rows = payments.data?.filter((p: any) => p.person_id === person.id) || [];
  return (
    <>
      {closed && (
        <p className="info">
          Período cerrado: consulta histórica. Para modificarlo, reabrilo desde Configuración.
        </p>
      )}
      <div className="section-heading">
        <h2>{periodName(periods.find((p) => p.id === period))}</h2>
        {!!person.activo && !closed && (
          <button className="primary" onClick={() => setEnroll({})}>
            <Plus size={17} /> Agregar actividad
          </button>
        )}
      </div>
      <QueryFeedback query={q} label="inscripciones" />
      {q.isPending && <CardsSkeleton label="Cargando inscripciones…" />}
      <div className="enroll-grid">
        {q.data?.map((e: any) => (
          <article className="panel enrollment" key={e.id}>
            <div className="section-heading">
              <h3>{e.activity}</h3>
              <span className="chip">{e.mode === 'individual' ? 'Individual' : 'Grupal'}</span>
            </div>
            {e.slots.map((s: any) => (
              <div className="slot" key={s.id}>
                <b>{days[s.day]}</b>
                <span>
                  {s.start} → {s.end} ·{' '}
                  {s.instructors.map((i: any) => i.name).join(' + ') || 'Sin facilitadores'}
                </span>
              </div>
            ))}
            <div className="actions">
              <button disabled={closed} onClick={() => setEnroll(e)}>
                Editar horarios
              </button>
              <DeleteButton
                disabled={closed}
                path={`/enrollments/${e.id}?period_id=${period}`}
                label="Cancelar inscripción"
              />
            </div>
          </article>
        ))}
      </div>
      {q.isSuccess && q.data?.length === 0 && (
        <Empty>Sin actividades en este período. Agregá la primera inscripción.</Empty>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2 className="finance-title">Cuenta del mes</h2>
          <button disabled={closed || a.data === undefined} onClick={() => setDue(true)}>
            Editar importe a cobrar
          </button>
        </div>
        <QueryFeedback query={a} label="cuenta del mes" />
        {a.isPending && (
          <SkeletonRegion label="Cargando cuenta del mes…">
            <div className="stats compact">
              {['A cobrar', 'Pagado', 'Saldo'].map((label) => (
                <div key={label}>
                  <small>{label}</small>
                  <Skeleton width="80%" height={25} />
                </div>
              ))}
            </div>
          </SkeletonRegion>
        )}
        {a.data !== undefined && (
          <div className="stats compact">
            <div>
              <small>A cobrar</small>
              <strong>
                {account?.amount_due != null
                  ? formatMoney(account.amount_due)
                  : 'Importe a cobrar no definido'}
              </strong>
            </div>
            <div>
              <small>Pagado</small>
              <strong>{formatMoney(account?.paid || '0')}</strong>
            </div>
            <div>
              <small>{Number(account?.balance) < 0 ? 'Saldo a favor' : 'Debe'}</small>
              <strong>
                {account?.balance != null
                  ? formatMoney(Math.abs(Number(account.balance)))
                  : 'No definido'}
              </strong>
            </div>
          </div>
        )}
        <div className="section-heading">
          <h3>Movimientos del período</h3>
          <button className="primary" disabled={closed} onClick={() => setPayment({})}>
            Registrar pago
          </button>
        </div>
        <QueryFeedback query={payments} label="pagos de la persona" />
        {payments.isPending && <ListSkeleton label="Cargando pagos de la persona…" />}
        {rows.map((p: any) => (
          <div className="payment-row" key={p.id}>
            <div>
              <b>{formatMoney(p.amount)}</b>
              <small>
                {formatDate(p.date)} · Receptor: {recipientLabel(p.recipient)} · Medio:{' '}
                {paymentMethodLabel(p.method)}
              </small>
              {p.notes && <small>{p.notes}</small>}
            </div>
            <div className="actions">
              <button disabled={closed} onClick={() => setPayment(p)}>
                Editar
              </button>
              <DeleteButton disabled={closed} path={`/payments/${p.id}?period_id=${period}`} />
            </div>
          </div>
        ))}
        {payments.isSuccess && !rows.length && <p className="muted">No hay pagos registrados.</p>}
      </section>
      {enroll && (
        <EnrollmentForm person={person} enrollment={enroll} close={() => setEnroll(undefined)} />
      )}
      {payment && (
        <PaymentForm person={person} payment={payment} close={() => setPayment(undefined)} />
      )}
      {due && <DueForm person={person} account={account} close={() => setDue(false)} />}
    </>
  );
}
function EnrollmentForm({
  person,
  enrollment: e,
  close,
}: {
  person: any;
  enrollment: any;
  close: () => void;
}) {
  const { period } = usePeriod();
  const offers = useData('offerings', `/offerings?period_id=${period}`, !!period);
  const [activity, setActivity] = useState(e.activity_id || 0);
  const [selected, setSelected] = useState<number[]>(e.slots?.map((s: any) => s.schedule_id) || []);
  const m = useSave(`/enrollments${e.id ? '/' + e.id : ''}`, e.id ? 'PUT' : 'POST', close);
  const [error, setError] = useState('');
  const offer = offers.data?.find((o: any) => o.activity_id === activity);
  return (
    <Modal title={e.id ? 'Editar horarios' : 'Agregar actividad'} close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const r = enrollmentSchema.safeParse({
            person_id: person.id,
            period_id: period,
            activity_id: activity,
            schedule_ids: selected,
          });
          if (!r.success) {
            setError(r.error.issues.map((i) => i.message).join(' '));
            return;
          }
          setError('');
          m.mutate(r.data);
        }}
      >
        <Field label="Actividad del período">
          <select
            value={activity}
            onChange={(ev) => {
              setActivity(Number(ev.target.value));
              setSelected([]);
            }}
          >
            <option value={0}>Seleccionar</option>
            {offers.data
              ?.filter(
                (o: any) => (o.active && o.catalog_active) || o.activity_id === e.activity_id,
              )
              .map((o: any) => (
                <option key={o.id} value={o.activity_id}>
                  {o.name}
                  {!o.active ? ' · No ofrecida' : ''}
                </option>
              ))}
          </select>
        </Field>
        {offer?.schedules
          .filter((h: any) => h.active || selected.includes(h.id))
          .map((h: any) => (
            <label className="check" key={h.id}>
              <input
                type="checkbox"
                checked={selected.includes(h.id)}
                onChange={(ev) =>
                  setSelected(
                    ev.target.checked ? [...selected, h.id] : selected.filter((id) => id !== h.id),
                  )
                }
              />
              {days[h.day]} {h.start}–{h.end} ·{' '}
              {h.instructors.map((i: any) => i.name).join(' + ') || 'Sin facilitadores'}
              {!h.active ? ' · Deshabilitado' : ''}
            </label>
          ))}
        {!offer?.schedules.length && (
          <p>
            Configurá primero los horarios en{' '}
            <Link to="/configuracion">Actividades del período</Link>.
          </p>
        )}
        <ErrorBox error={error ? new Error(error) : m.error || offers.error} />
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
function DueForm({ person, account, close }: { person: any; account: any; close: () => void }) {
  const { period } = usePeriod();
  const [value, set] = useState(account?.amount_due ?? '');
  const m = useSave('/accounts', 'PUT', close);
  return (
    <Modal title="Importe a cobrar" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({
            person_id: person.id,
            period_id: period,
            amount_due: value === '' ? null : value,
          });
        }}
      >
        <Field label="Importe manual (ARS)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => set(e.target.value)}
          />
        </Field>
        <p>
          Dejá el campo vacío si todavía no está definido. Cero significa que no se cobra este mes.
        </p>
        <ErrorBox error={m.error} />
        <div className="actions">
          <SaveButton pending={m.isPending} />
        </div>
      </form>
    </Modal>
  );
}
function PaymentForm({
  person,
  payment: p,
  close,
}: {
  person: any;
  payment: Partial<Payment>;
  close: () => void;
}) {
  const { period } = usePeriod();
  const [data, set] = useState({
    date: p.date || today(),
    amount: p.amount || '',
    method: p.method || '',
    recipient: p.recipient || '',
    notes: p.notes || '',
  });
  const [error, setError] = useState('');
  const m = useSave(p.id ? `/payments/${p.id}` : '/payments', p.id ? 'PUT' : 'POST', close);
  return (
    <Modal title={p.id ? 'Editar pago' : 'Registrar pago'} close={close}>
      <p className="participant-name">
        {person.nombre} {person.apellido}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const body = { ...data, person_id: person.id, period_id: period };
          const v = paymentSchema.safeParse(body);
          if (!v.success) {
            setError(v.error.issues.map((x) => x.message).join(' '));
            return;
          }
          setError('');
          m.mutate(body);
        }}
      >
        <div className="form-grid">
          <Field label="Fecha">
            <input
              type="date"
              required
              value={data.date}
              onInput={(e) => {
                const date = e.currentTarget.value;
                set((current) => ({ ...current, date }));
              }}
              onChange={(e) => set({ ...data, date: e.target.value })}
            />
          </Field>
          <Field label="Monto (ARS)">
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={data.amount}
              onChange={(e) => set({ ...data, amount: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Receptor">
          <select
            required
            value={data.recipient}
            onChange={(e) => set({ ...data, recipient: e.target.value })}
          >
            <option value="">Seleccionar receptor</option>
            <option value="jesica">Jésica</option>
            <option value="hernan">Hernán</option>
          </select>
        </Field>
        <Field label="Medio de pago">
          <select
            required
            value={data.method}
            onChange={(e) => set({ ...data, method: e.target.value })}
          >
            <option value="">Seleccionar medio</option>
            <option value="transfer">Transferencia</option>
            <option value="cash">Efectivo</option>
          </select>
        </Field>
        <Field label="Observaciones">
          <textarea value={data.notes} onChange={(e) => set({ ...data, notes: e.target.value })} />
        </Field>
        <p className="muted">
          Para un pago dividido, registrá un movimiento por cada combinación de receptor y medio.
        </p>
        <ErrorBox error={error ? new Error(error) : m.error} />
        <div className="actions">
          <SaveButton pending={m.isPending} />
        </div>
      </form>
    </Modal>
  );
}
export function Agenda() {
  const { period } = usePeriod();
  return <AgendaPeriod key={period} />;
}
function AgendaPeriod() {
  const { period } = usePeriod();
  const q = useData('agenda', `/agenda?period_id=${period}`, !!period);
  const activities = new Map<number, string>();
  const teachers = new Map<number, string>();
  for (const h of q.data || []) {
    activities.set(h.activity_id, h.activity);
    for (const i of h.instructors) teachers.set(i.id, i.name);
  }
  const [teacher, setTeacher] = useState('');
  const [activity, setActivity] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const groups = new Map<string, any>();
  for (const h of q.data || []) {
    if (
      (teacher && !h.instructors.some((i: any) => String(i.id) === teacher)) ||
      (activity && String(h.activity_id) !== activity) ||
      (day && String(h.day) !== day) ||
      (time && h.start !== time)
    )
      continue;
    groups.set(String(h.id), {
      ...h,
      slot: h,
      instructor: h.instructors.map((i: any) => i.name).join(' + ') || 'Sin facilitadores',
    });
  }
  return (
    <>
      <Heading title="Agenda Período" sub="Horarios y asistentes del período seleccionado." />
      <div className="filters">
        <Field label="Facilitador">
          <select value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="">Todos</option>
            {[...teachers].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Actividad">
          <select value={activity} onChange={(e) => setActivity(e.target.value)}>
            <option value="">Todas</option>
            {[...activities].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Día">
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Todos</option>
            {days.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hora de inicio">
          <select value={time} onChange={(e) => setTime(e.target.value)}>
            <option value="">Todas</option>
            {times.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      {!period && <Empty>Creá o seleccioná un período.</Empty>}
      <QueryFeedback query={q} label="agenda" />
      {!!period && q.isPending && <CardsSkeleton label="Cargando horarios y participantes…" />}
      <div className="enroll-grid agenda-grid">
        {[...groups.entries()]
          .sort(
            (a, b) =>
              a[1].slot.day - b[1].slot.day || a[1].slot.start.localeCompare(b[1].slot.start),
          )
          .map(([key, g]) => (
            <section className="panel agenda-card" key={key}>
              <span className="eyebrow">
                {days[g.slot.day]} · {g.slot.start}–{g.slot.end}
              </span>
              <h2>{g.activity}</h2>
              <p>
                {g.instructor} · {g.people.length} asistentes
              </p>
              {g.people.map((p: any) => (
                <Link
                  className="attendee participant-name"
                  key={p.person_id}
                  to={`/personas/${p.person_id}`}
                >
                  <span>
                    {p.nombre} {p.apellido}
                  </span>
                </Link>
              ))}
            </section>
          ))}
      </div>
      {q.isSuccess && !groups.size && <Empty>Sin horarios para estos filtros.</Empty>}
    </>
  );
}
export function Payments() {
  const { period } = usePeriod();
  return <PaymentsPeriod key={period} />;
}
function PaymentsPeriod() {
  const { period, periods } = usePeriod();
  const closed = periods.find((p) => p.id === period)?.status === 'closed';
  const q = useData('accounts', `/accounts?period_id=${period}`, !!period);
  const payments = useData('payments', `/payments?period_id=${period}`, !!period);
  const [pick, setPick] = useState(false);
  const [person, setPerson] = useState<any>();
  const [edit, setEdit] = useState<any>();
  return (
    <>
      <Heading title="Cobros Período" sub="Cuentas mensuales, movimientos y carteras.">
        <button className="primary" disabled={!period || closed} onClick={() => setPick(true)}>
          <Plus size={17} /> Registrar pago
        </button>
      </Heading>
      {!period && <Empty>Creá o seleccioná un período.</Empty>}
      <section
        className="panel table-wrap accounts-table-panel"
        aria-busy={(!!period && q.isPending) || undefined}
      >
        <h2>Cuentas del mes</h2>
        <QueryFeedback query={q} label="cuentas" />
        {!!period && q.isPending && (
          <span className="skeleton-status" role="status">
            Cargando cuentas…
          </span>
        )}
        <table className="accounts-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>A cobrar</th>
              <th className="desktop-only">Pagado</th>
              <th>
                <span className="desktop-only">Saldo / deuda</span>
                <span className="mobile-only">Saldo</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!!period &&
              q.isPending &&
              Array.from({ length: 3 }, (_, i) => (
                <tr className="loading-account-row" aria-hidden="true" key={`loading-${i}`}>
                  <td>
                    <Skeleton width="80%" height={14} />
                  </td>
                  <td>
                    <Skeleton width="75%" height={14} />
                  </td>
                  <td className="desktop-only">
                    <Skeleton width="75%" height={14} />
                  </td>
                  <td>
                    <Skeleton width="75%" height={14} />
                  </td>
                </tr>
              ))}
            {q.data?.map((a: any) => (
              <tr key={a.id}>
                <td>
                  <Link
                    className="account-person-link participant-name"
                    to={`/personas/${a.person_id}`}
                    title={`${a.nombre} ${a.apellido}`}
                  >
                    <span>
                      {a.nombre} {a.apellido}
                    </span>
                  </Link>
                </td>
                <td>{formatMoney(a.amount_due)}</td>
                <td className="desktop-only">{formatMoney(a.paid)}</td>
                <td>
                  <span
                    className={`${Number(a.balance) > 0 ? 'debt-chip' : ''} account-balance ${a.balance === null ? 'balance-undefined' : Number(a.balance) === 0 ? 'balance-settled' : Number(a.balance) < 0 ? 'balance-credit' : ''}`}
                  >
                    {a.balance === null
                      ? 'No definido'
                      : Number(a.balance) < 0
                        ? `${formatMoney(-Number(a.balance))} a favor`
                        : formatMoney(a.balance)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.isSuccess && q.data?.length === 0 && <Empty>Sin cuentas en este período.</Empty>}
      </section>
      <section className="panel">
        <h2>Movimientos</h2>
        <QueryFeedback query={payments} label="movimientos" />
        {!!period && payments.isPending && <ListSkeleton label="Cargando movimientos…" />}
        {payments.data?.map((p: any) => (
          <div className="payment-row" key={p.id}>
            <div>
              <b>
                <span className="participant-name">
                  {p.nombre} {p.apellido}
                </span>{' '}
                · <span className="payment-amount">{formatMoney(p.amount)}</span>
              </b>
              <small>
                {formatDate(p.date)} · Receptor: {recipientLabel(p.recipient)} · Medio:{' '}
                {paymentMethodLabel(p.method)}
              </small>
              <small>{p.notes}</small>
            </div>
            <div className="actions">
              <button
                disabled={closed}
                onClick={() => {
                  setPerson({ id: p.person_id, nombre: p.nombre, apellido: p.apellido });
                  setEdit(p);
                }}
              >
                Editar
              </button>
              <DeleteButton disabled={closed} path={`/payments/${p.id}?period_id=${period}`} />
            </div>
          </div>
        ))}
        {payments.isSuccess && payments.data?.length === 0 && <Empty>Sin pagos registrados.</Empty>}
      </section>
      {pick && (
        <Modal title="Seleccionar persona" close={() => setPick(false)}>
          <PaymentMemberPicker
            key={period}
            onSelect={(p) => {
              setPerson(p);
              setPick(false);
              setEdit({});
            }}
          />
        </Modal>
      )}
      {edit && <PaymentForm person={person} payment={edit} close={() => setEdit(undefined)} />}
    </>
  );
}
function PaymentMemberPicker({ onSelect }: { onSelect: (p: any) => void }) {
  const { period } = usePeriod();
  const q = useData('memberships', `/periods/${period}/memberships`, !!period);
  return (
    <>
      <p>Personas incorporadas al período. Para incorporar otra, usá Inscriptos Período.</p>
      <QueryFeedback query={q} label="personas del período" />
      {!!period && q.isPending && <ListSkeleton label="Cargando personas del período…" />}
      <div className="pick-list">
        {q.data?.map((p: any) => (
          <button key={p.membership_id} onClick={() => onSelect(p)}>
            <span className="participant-name">
              {p.apellido}, {p.nombre}
            </span>
          </button>
        ))}
      </div>
      {q.data?.length === 0 && <Empty>No hay personas inscriptas en este período.</Empty>}
    </>
  );
}
