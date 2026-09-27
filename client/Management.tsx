import { PeriodAdmin } from './Periods';
import { scheduleConflict, type Booking } from '../shared/schedule';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, LockKeyhole } from 'lucide-react';
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
} from './components';
import { PersonPicker } from './People';
import { usePeriod, periodName } from './App';
import {
  days,
  times,
  formatMoney,
  wallet,
  enrollmentSchema,
  paymentSchema,
  advertisingSchema,
  activitySchema,
  instructorSchema,
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
    <div className="page-heading">
      <div>
        <span className="eyebrow">ADMINISTRACIÓN</span>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children}
    </div>
  );
}
export function Monthly() {
  const { period } = usePeriod();
  const [person, setPerson] = useState<any>();
  return (
    <>
      <Heading
        title="Gestión mensual"
        sub="Buscá una persona y organizá sus actividades del mes."
      />
      {!period ? (
        <Empty>Creá o seleccioná un período.</Empty>
      ) : (
        <>
          {person ? (
            <div className="selected-person">
              <div>
                <Link to={`/personas/${person.id}`}>
                  {person.nombre} {person.apellido}
                </Link>
                <small>
                  {person.public_id} · {person.telefono}
                </small>
              </div>
              <button onClick={() => setPerson(undefined)}>Cambiar persona</button>
            </div>
          ) : (
            <section className="panel">
              <PersonPicker onSelect={setPerson} />
            </section>
          )}
          {person && <PersonMonth person={person} />}
        </>
      )}
    </>
  );
}
export function PersonMonth({ person }: { person: any }) {
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
      <ErrorBox error={q.error || a.error || payments.error} />
      <div className="enroll-grid">
        {q.data?.map((e: any) => (
          <article className="panel enrollment" key={e.id}>
            <div className="section-heading">
              <h3>{e.activity}</h3>
              <span className="chip">{e.instructor}</span>
            </div>
            {e.slots.map((s: any) => (
              <div className="slot" key={s.id}>
                <b>{days[s.day]}</b>
                <span>
                  {s.start} → {s.end}
                </span>
              </div>
            ))}
            <div className="actions">
              <button disabled={closed} onClick={() => setEnroll(e)}>
                Editar horarios
              </button>
              <DeleteButton
                disabled={closed}
                path={`/enrollments/${e.id}`}
                label="Cancelar inscripción"
              />
            </div>
          </article>
        ))}
      </div>
      {q.isPending && <Loading />}
      {q.data?.length === 0 && (
        <Empty>Sin actividades en este período. Agregá la primera inscripción.</Empty>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2 className="finance-title">Cuenta del mes</h2>
          <button disabled={closed} onClick={() => setDue(true)}>
            Editar importe a cobrar
          </button>
        </div>
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
        <div className="section-heading">
          <h3>Movimientos del período</h3>
          <button className="primary" disabled={closed} onClick={() => setPayment({})}>
            Registrar pago
          </button>
        </div>
        {rows.map((p: any) => (
          <div className="payment-row" key={p.id}>
            <div>
              <b>{formatMoney(p.amount)}</b>
              <small>
                {p.date} · Cartera {wallet(p.method)}
              </small>
              {p.notes && <small>{p.notes}</small>}
            </div>
            <div className="actions">
              <button disabled={closed} onClick={() => setPayment(p)}>
                Editar
              </button>
              <DeleteButton disabled={closed} path={`/payments/${p.id}`} />
            </div>
          </div>
        ))}
        {!rows.length && <p className="muted">No hay pagos registrados.</p>}
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
  const a = useData('activities', '/activities');
  const all = useData('agenda', `/enrollments?period_id=${period}`, !!period);
  const [activity, setActivity] = useState(e.activity_id || 0);
  const [slots, setSlots] = useState<{ day: number; start: string; end: string }[]>(
    e.slots || [{ day: -1, start: '09:00', end: '10:00' }],
  );
  const [error, setError] = useState('');
  const m = useSave(e.id ? `/enrollments/${e.id}` : '/enrollments', e.id ? 'PUT' : 'POST', close);
  const selected = a.data?.find((x: any) => x.id === activity);
  const update = (i: number, key: string, value: any) =>
    setSlots(slots.map((s, n) => (n === i ? { ...s, [key]: value } : s)));
  return (
    <Modal title={e.id ? 'Editar inscripción' : 'Agregar actividad'} close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = {
            person_id: person.id,
            period_id: period,
            activity_id: activity,
            slots: slots.map((s) => ({ day: s.day, start: s.start, end: s.end })),
          };
          const valid = enrollmentSchema.safeParse(data);
          if (!valid.success) {
            setError(valid.error.issues.map((i) => i.message).join(' '));
            return;
          }
          const existing: Booking[] = (all.data || [])
            .filter((x: any) => x.id !== e.id)
            .flatMap((x: any) =>
              x.slots.map((slot: any) => ({
                ...slot,
                ...x,
                mode: a.data?.find((t: any) => t.id === x.activity_id)?.mode,
              })),
            );
          for (const slot of slots) {
            const next = {
              ...slot,
              person_id: person.id,
              activity_id: activity,
              instructor_id: selected?.instructor_id,
              activity: selected?.name,
              mode: selected?.mode,
            };
            const conflict = scheduleConflict(next, existing);
            if (conflict) {
              setError(conflict);
              return;
            }
            existing.push(next);
          }
          setError('');
          m.mutate(data);
        }}
      >
        <Field label="Actividad">
          <select
            value={activity}
            onChange={(event) => {
              setActivity(Number(event.target.value));
              setSlots(slots.map((s) => ({ ...s, day: -1 })));
            }}
            required
          >
            <option value={0}>Elegir actividad</option>
            {a.data
              ?.filter((x: any) => x.active || x.id === activity)
              .map((x: any) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Field>
        <p>
          Docente: <b>{selected?.instructor || 'Seleccioná una actividad'}</b>
        </p>
        {slots.map((s, i) => (
          <section className="slot-editor" key={i}>
            <div className="section-heading">
              <h3>Horario {i + 1}</h3>
              {slots.length > 1 && (
                <button
                  type="button"
                  className="danger subtle"
                  onClick={() => setSlots(slots.filter((_, n) => n !== i))}
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="day-buttons">
              {days.map((day, n) => {
                const allowed = selected?.days.includes(n);
                return (
                  <button
                    key={day}
                    title={allowed ? day : `${day}: no permitido`}
                    type="button"
                    disabled={!allowed}
                    className={`${s.day === n ? 'selected' : ''} ${!allowed ? 'blocked' : ''}`}
                    onClick={() => update(i, 'day', n)}
                  >
                    {!allowed && <LockKeyhole size={12} />}
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <div className="form-grid">
              <Field label="Hora inicio">
                <select
                  value={s.start}
                  onChange={(event) => update(i, 'start', event.target.value)}
                >
                  {times.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Hora fin">
                <select value={s.end} onChange={(event) => update(i, 'end', event.target.value)}>
                  {times.map((t) => (
                    <option disabled={t <= s.start} key={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
        ))}
        <button
          type="button"
          onClick={() => setSlots([...slots, { day: -1, start: '09:00', end: '10:00' }])}
        >
          + Agregar otro día / horario
        </button>
        <ErrorBox error={error ? new Error(error) : m.error || a.error} />
        <div className="actions">
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
  payment: any;
  close: () => void;
}) {
  const { period } = usePeriod();
  const [data, set] = useState({
    date: p.date || today(),
    amount: p.amount || '',
    method: p.method || 'transfer',
    notes: p.notes || '',
  });
  const [error, setError] = useState('');
  const m = useSave(p.id ? `/payments/${p.id}` : '/payments', p.id ? 'PUT' : 'POST', close);
  return (
    <Modal title={p.id ? 'Editar pago' : 'Registrar pago'} close={close}>
      <p>
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
        <Field label="Medio de pago">
          <select value={data.method} onChange={(e) => set({ ...data, method: e.target.value })}>
            <option value="transfer">Transferencia</option>
            <option value="cash">Efectivo</option>
          </select>
        </Field>
        <p className="info">Cartera {wallet(data.method as any)} · Asignada automáticamente</p>
        <Field label="Observaciones">
          <textarea value={data.notes} onChange={(e) => set({ ...data, notes: e.target.value })} />
        </Field>
        <p className="muted">Para un pago dividido, registrá un movimiento por cada medio.</p>
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
  const q = useData('agenda', `/enrollments?period_id=${period}`, !!period);
  const activities = useData('activities', '/activities');
  const teachers = useData('instructors', '/instructors');
  const [teacher, setTeacher] = useState('');
  const [activity, setActivity] = useState('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const groups = new Map<string, any>();
  for (const e of q.data || [])
    for (const s of e.slots) {
      if (
        (teacher && String(e.instructor_id) !== teacher) ||
        (activity && String(e.activity_id) !== activity) ||
        (day && String(s.day) !== day) ||
        (time && s.start !== time)
      )
        continue;
      const key = `${e.activity_id}-${s.day}-${s.start}-${s.end}`;
      if (!groups.has(key)) groups.set(key, { ...e, slot: s, people: [] });
      groups.get(key).people.push(e);
    }
  return (
    <>
      <Heading title="Agenda / Talleres" sub="Horarios y asistentes del período seleccionado." />
      <div className="filters">
        <Field label="Docente">
          <select value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="">Todos</option>
            {teachers.data?.map((i: any) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Actividad">
          <select value={activity} onChange={(e) => setActivity(e.target.value)}>
            <option value="">Todas</option>
            {activities.data?.map((i: any) => (
              <option key={i.id} value={i.id}>
                {i.name}
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
      <ErrorBox error={q.error || activities.error || teachers.error} />
      <div className="enroll-grid">
        {[...groups.entries()]
          .sort(
            (a, b) =>
              a[1].slot.day - b[1].slot.day || a[1].slot.start.localeCompare(b[1].slot.start),
          )
          .map(([key, g]) => (
            <section className="panel" key={key}>
              <span className="eyebrow">
                {days[g.slot.day]} · {g.slot.start}–{g.slot.end}
              </span>
              <h2>{g.activity}</h2>
              <p>
                {g.instructor} · {g.people.length} asistentes
              </p>
              {g.people.map((p: any) => (
                <Link className="attendee" key={p.id} to={`/personas/${p.person_id}`}>
                  <span>
                    {p.nombre} {p.apellido}
                  </span>
                  <small>{p.public_id}</small>
                </Link>
              ))}
            </section>
          ))}
      </div>
      {!groups.size && <Empty>Sin horarios para estos filtros.</Empty>}
    </>
  );
}
export function Payments() {
  const { period, periods } = usePeriod();
  const closed = periods.find((p) => p.id === period)?.status === 'closed';
  const q = useData('accounts', `/accounts?period_id=${period}`, !!period);
  const payments = useData('payments', `/payments?period_id=${period}`, !!period);
  const [pick, setPick] = useState(false);
  const [person, setPerson] = useState<any>();
  const [edit, setEdit] = useState<any>();
  return (
    <>
      <Heading title="Pagos" sub="Cuentas mensuales, movimientos y carteras.">
        <button className="primary" disabled={!period || closed} onClick={() => setPick(true)}>
          <Plus size={17} /> Registrar pago
        </button>
      </Heading>
      <ErrorBox error={q.error || payments.error} />
      <section className="panel table-wrap">
        <h2>Cuentas del mes</h2>
        <table>
          <thead>
            <tr>
              <th>Persona</th>
              <th>A cobrar</th>
              <th>Pagado</th>
              <th>Saldo / deuda</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.map((a: any) => (
              <tr key={a.id}>
                <td>
                  <Link to={`/personas/${a.person_id}`}>
                    {a.nombre} {a.apellido}
                  </Link>
                </td>
                <td>{formatMoney(a.amount_due)}</td>
                <td>{formatMoney(a.paid)}</td>
                <td>
                  <span className={Number(a.balance) > 0 ? 'warning' : ''}>
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
        {!q.data?.length && <Empty>Sin cuentas en este período.</Empty>}
      </section>
      <section className="panel">
        <h2>Movimientos</h2>
        {payments.data?.map((p: any) => (
          <div className="payment-row" key={p.id}>
            <div>
              <b>
                {p.nombre} {p.apellido} · {formatMoney(p.amount)}
              </b>
              <small>
                {p.date} · Cartera {wallet(p.method)}
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
              <DeleteButton disabled={closed} path={`/payments/${p.id}`} />
            </div>
          </div>
        ))}
        {!payments.data?.length && <Empty>Sin pagos registrados.</Empty>}
      </section>
      {pick && (
        <Modal title="Seleccionar persona" close={() => setPick(false)}>
          <PersonPicker
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
export function Advertising() {
  const { period } = usePeriod();
  const q = useData('advertising', `/advertising?period_id=${period}`, !!period);
  const [edit, setEdit] = useState<any>();
  return (
    <>
      <Heading
        title="Inversión publicidad"
        sub="Inversiones del período, separadas de los pagos de alumnos."
      >
        <button className="primary" onClick={() => setEdit({})}>
          <Plus size={17} /> Nueva inversión
        </button>
      </Heading>
      <ErrorBox error={q.error} />
      <section className="panel">
        {q.data?.map((a: any) => (
          <div className="payment-row" key={a.id}>
            <div>
              <b>
                {a.concept} · {formatMoney(a.amount)}
              </b>
              <small>{a.date}</small>
              <p>{a.notes}</p>
            </div>
            <div className="actions">
              <button onClick={() => setEdit(a)}>Editar</button>
              <DeleteButton path={`/advertising/${a.id}`} />
            </div>
          </div>
        ))}
        {!q.data?.length && <Empty>Sin inversiones publicitarias en este período.</Empty>}
      </section>
      {edit && <AdvertisingForm value={edit} close={() => setEdit(undefined)} />}
    </>
  );
}
function AdvertisingForm({ value: v, close }: { value: any; close: () => void }) {
  const { period, periods } = usePeriod();
  const selectedPeriod = periods.find((p) => p.id === period);
  const selectedMonth = selectedPeriod
    ? `${selectedPeriod.year}-${String(selectedPeriod.month).padStart(2, '0')}`
    : today().slice(0, 7);
  const [data, set] = useState({
    date: v.date || (today().startsWith(selectedMonth) ? today() : `${selectedMonth}-01`),
    concept: v.concept || '',
    amount: v.amount || '',
    notes: v.notes || '',
  });
  const [error, setError] = useState('');
  const m = useSave(v.id ? `/advertising/${v.id}` : '/advertising', v.id ? 'PUT' : 'POST', close);
  return (
    <Modal title="Inversión publicitaria" close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const valid = advertisingSchema.safeParse(data);
          if (!valid.success) {
            setError(valid.error.issues.map((i) => i.message).join(' '));
            return;
          }
          setError('');
          m.mutate(data);
        }}
      >
        {Object.entries({
          date: 'Fecha',
          concept: 'Concepto',
          amount: 'Importe (ARS)',
          notes: 'Notas',
        }).map(([key, label]) => (
          <Field label={label} key={key}>
            <input
              required={key !== 'notes'}
              type={key === 'date' ? 'date' : key === 'amount' ? 'number' : 'text'}
              min={key === 'amount' ? '0' : undefined}
              step={key === 'amount' ? '0.01' : undefined}
              value={(data as any)[key]}
              onInput={
                key === 'date'
                  ? (e) => {
                      const date = e.currentTarget.value;
                      set((current) => ({ ...current, date }));
                    }
                  : undefined
              }
              onChange={(e) => set({ ...data, [key]: e.target.value })}
            />
          </Field>
        ))}
        <p className="muted">La inversión se mostrará en el período correspondiente a su fecha.</p>
        <ErrorBox error={error ? new Error(error) : m.error} />
        <div className="actions">
          <SaveButton pending={m.isPending} />
        </div>
      </form>
    </Modal>
  );
}
export function Configuration() {
  const a = useData('activities', '/activities');
  const i = useData('instructors', '/instructors');
  const [edit, setEdit] = useState<any>();
  const [kind, setKind] = useState('');
  return (
    <>
      <Heading
        title="Configuración"
        sub="Docentes, actividades y reglas de días. Los docentes no son usuarios."
      />
      <ErrorBox error={a.error || i.error} />
      <section className="panel">
        <div className="section-heading">
          <h2>Actividades</h2>
          <button
            onClick={() => {
              setKind('activities');
              setEdit({});
            }}
          >
            + Nueva actividad
          </button>
        </div>
        {a.data?.map((x: any) => (
          <div className="payment-row" key={x.id}>
            <div>
              <b>{x.name}</b>
              <small>
                {x.instructor} · {x.mode === 'individual' ? 'Individual · capacidad 1' : 'Grupal'} ·{' '}
                {x.active ? 'Activa' : 'Inactiva'}
              </small>
              <p>{x.days.map((d: number) => days[d]).join(' · ')}</p>
            </div>
            <button
              onClick={() => {
                setKind('activities');
                setEdit(x);
              }}
            >
              Editar
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Docentes</h2>
          <button
            onClick={() => {
              setKind('instructors');
              setEdit({});
            }}
          >
            + Nuevo docente
          </button>
        </div>
        {i.data?.map((x: any) => (
          <div className="payment-row" key={x.id}>
            <span>
              {x.name} <small>{x.active ? 'Activo' : 'Inactivo'}</small>
            </span>
            <button
              onClick={() => {
                setKind('instructors');
                setEdit(x);
              }}
            >
              Editar
            </button>
          </div>
        ))}
      </section>
      <PeriodAdmin />
      {edit && (
        <ConfigForm
          kind={kind}
          value={edit}
          teachers={i.data || []}
          close={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
function ConfigForm({
  kind,
  value: v,
  teachers,
  close,
}: {
  kind: string;
  value: any;
  teachers: any[];
  close: () => void;
}) {
  const [data, set] = useState({
    name: v.name || '',
    active: v.active === undefined ? true : !!v.active,
    mode: v.mode || 'group',
    instructor_id: v.instructor_id || 0,
    days: v.days || ([] as number[]),
  });
  const [error, setError] = useState('');
  const m = useSave(`/${kind}${v.id ? '/' + v.id : ''}`, v.id ? 'PUT' : 'POST', close);
  return (
    <Modal
      title={kind === 'activities' ? 'Configurar actividad' : 'Configurar docente'}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const schema = kind === 'activities' ? activitySchema : instructorSchema;
          const r = schema.safeParse(data);
          if (!r.success) {
            setError('Revisá el nombre, docente y al menos un día permitido.');
            return;
          }
          setError('');
          m.mutate(r.data);
        }}
      >
        <Field label="Nombre">
          <input
            required
            value={data.name}
            onChange={(e) => set({ ...data, name: e.target.value })}
          />
        </Field>
        <label className="check">
          <input
            type="checkbox"
            checked={data.active}
            onChange={(e) => set({ ...data, active: e.target.checked })}
          />{' '}
          Activo
        </label>
        {kind === 'activities' && (
          <>
            <Field label="Docente">
              <select
                value={data.instructor_id}
                onChange={(e) => set({ ...data, instructor_id: Number(e.target.value) })}
              >
                <option value={0}>Seleccionar</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modalidad">
              <select value={data.mode} onChange={(e) => set({ ...data, mode: e.target.value })}>
                <option value="group">Grupal</option>
                <option value="individual">Individual · capacidad 1</option>
              </select>
            </Field>
            <p>Días permitidos</p>
            <div className="day-buttons">
              {days.map((d, n) => (
                <button
                  type="button"
                  key={d}
                  className={data.days.includes(n) ? 'selected' : ''}
                  onClick={() =>
                    set({
                      ...data,
                      days: data.days.includes(n)
                        ? data.days.filter((x: number) => x !== n)
                        : [...data.days, n],
                    })
                  }
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
            <p className="info">
              Las inscripciones existentes se conservan. Las reglas nuevas se aplican al crear o
              editar horarios.
            </p>
          </>
        )}
        <ErrorBox error={error ? new Error(error) : m.error} />
        <div className="actions">
          <SaveButton pending={m.isPending} />
        </div>
      </form>
    </Modal>
  );
}
