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
} from './components';
import { PersonPicker } from './People';
import { usePeriod, periodName } from './App';
import {
  days,
  times,
  formatMoney,
  formatDate,
  wallet,
  enrollmentSchema,
  paymentSchema,
  advertisingSchema,
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
                {formatDate(p.date)} · Cartera {wallet(p.method)}
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
      <Heading title="Agenda / Talleres" sub="Horarios y asistentes del período seleccionado." />
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
      <ErrorBox error={q.error} />
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
                <Link className="attendee" key={p.person_id} to={`/personas/${p.person_id}`}>
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
                {formatDate(p.date)} · Cartera {wallet(p.method)}
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
              <small>{formatDate(a.date)}</small>
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
