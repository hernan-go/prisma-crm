import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { usePeriod, periodName } from './App';
import { PeriodAdmin } from './Periods';
import { Field, Modal, ErrorBox, useSave, SaveButton, DeleteButton } from './components';
import {
  days,
  times,
  activitySchema,
  instructorSchema,
  offeringSchema,
  scheduleSchema,
  facilitatorName,
} from '../shared/domain';
const useList = (path: string, enabled = true) =>
  useQuery({ queryKey: [path], queryFn: () => api(path), enabled });
export function Configuration() {
  const { period, periods } = usePeriod();
  const catalog = useList('/activities');
  const teachers = useList('/instructors');
  const offers = useList(`/offerings?period_id=${period}`, !!period);
  const [edit, setEdit] = useState<any>();
  const closed = periods.find((p) => p.id === period)?.status === 'closed';
  return (
    <>
      <h1>Configuración</h1>
      <p>Catálogo global, facilitadores y oferta mensual independiente.</p>
      <ErrorBox error={catalog.error || teachers.error || offers.error} />
      <section className="panel">
        <div className="section-heading">
          <h2>Actividades del período · {periodName(periods.find((p) => p.id === period))}</h2>
          <button
            disabled={!period || closed}
            onClick={() => setEdit({ kind: 'offerings', value: { period_id: period, days: [] } })}
          >
            Agregar del catálogo
          </button>
        </div>
        {closed && <p>Período cerrado: solo consulta.</p>}
        {offers.data?.map((o: any) => (
          <article className="slot-editor" key={o.id}>
            <div className="section-heading">
              <div>
                <h3>{o.name}</h3>
                <small>
                  {o.active ? 'Ofrecida' : 'No ofrecida'} ·{' '}
                  {o.mode === 'individual' ? 'Individual · capacidad 1' : 'Grupal'}
                </small>
              </div>
              <button disabled={closed} onClick={() => setEdit({ kind: 'offerings', value: o })}>
                Editar oferta
              </button>
            </div>
            <p>{o.days.map((d: number) => days[d]).join(' · ') || 'Sin días habilitados'}</p>
            {o.schedules.map((h: any) => (
              <div className="payment-row" key={h.id}>
                <div>
                  <b>
                    {days[h.day]} {h.start}–{h.end}
                  </b>
                  <small>
                    {h.instructors.map((i: any) => i.name).join(' + ') || 'Sin facilitadores'} ·{' '}
                    {h.active ? 'Habilitado' : 'Deshabilitado'}
                  </small>
                </div>
                <button
                  disabled={closed}
                  onClick={() =>
                    setEdit({
                      kind: 'schedules',
                      value: { ...h, instructor_ids: h.instructors.map((i: any) => i.id) },
                      offering: o,
                    })
                  }
                >
                  Editar horario
                </button>
              </div>
            ))}
            <button
              disabled={closed || !o.active || !o.catalog_active}
              onClick={() =>
                setEdit({
                  kind: 'schedules',
                  value: {
                    offering_id: o.id,
                    day: o.days[0] ?? -1,
                    start: '09:00',
                    end: '10:00',
                    instructor_ids: [],
                  },
                  offering: o,
                })
              }
            >
              Agregar horario
            </button>
          </article>
        ))}
        {!offers.data?.length && (
          <p>
            Este período no tiene oferta. Agregá únicamente las actividades que se dictan este mes.
          </p>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Catálogo global de actividades</h2>
          <button
            onClick={() => setEdit({ kind: 'activities', value: { days: [0, 1, 2, 3, 4, 5, 6] } })}
          >
            Nueva actividad
          </button>
        </div>
        <p>Archivar conserva el historial. No ofrecer un mes se administra arriba.</p>
        {catalog.data?.map((a: any) => (
          <div className="payment-row" key={a.id}>
            <div>
              <b>{a.name}</b>
              <small>{a.active ? 'Activa' : 'Archivada'}</small>
            </div>
            <div className="actions">
              <button onClick={() => setEdit({ kind: 'activities', value: a })}>
                Editar actividad
              </button>
              {!a.ever_used && <DeleteButton path={`/activities/${a.id}`} />}
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Facilitadores</h2>
          <button onClick={() => setEdit({ kind: 'instructors', value: {} })}>
            Nuevo facilitador
          </button>
        </div>
        <p>
          Registros administrativos manuales, sin acceso al CRM. Si tuvieron uso, solo pueden
          inactivarse.
        </p>
        {teachers.data?.map((i: any) => (
          <div className="payment-row" key={i.id}>
            <div>
              <b>{facilitatorName(i)}</b>
              <small>
                {i.active ? 'Activo' : 'Inactivo'}
                {i.ever_used ? ' · Con historial' : ''}
              </small>
            </div>
            <div className="actions">
              <button onClick={() => setEdit({ kind: 'instructors', value: i })}>
                Editar facilitador
              </button>
              {!i.ever_used && <DeleteButton path={`/instructors/${i.id}`} />}
            </div>
          </div>
        ))}
      </section>
      <PeriodAdmin />
      {edit && (
        <ConfigEditor
          key={`${edit.kind}-${edit.value.id || 0}`}
          {...edit}
          catalog={catalog.data || []}
          teachers={teachers.data || []}
          close={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
function ConfigEditor({
  kind,
  value: v,
  offering,
  catalog,
  teachers,
  close,
}: {
  kind: string;
  value: any;
  offering?: any;
  catalog: any[];
  teachers: any[];
  close: () => void;
}) {
  const [data, set] = useState<any>({
    name: '',
    surname: '',
    dni: '',
    phone: '',
    email: '',
    address: '',
    mode: 'group',
    days: [],
    instructor_ids: [],
    ...v,
    active: v.active === undefined ? true : !!v.active,
  });
  const [error, setError] = useState('');
  const m = useSave(`/${kind}${v.id ? '/' + v.id : ''}`, v.id ? 'PUT' : 'POST', close);
  const schema =
    kind === 'activities'
      ? activitySchema
      : kind === 'instructors'
        ? instructorSchema
        : kind === 'offerings'
          ? offeringSchema
          : scheduleSchema;
  const locked = kind === 'schedules' && !!v.ever_used;
  const patch = (p: any) => set({ ...data, ...p });
  return (
    <Modal
      title={
        {
          activities: 'Actividad del catálogo',
          instructors: 'Facilitador',
          offerings: 'Oferta del período',
          schedules: 'Horario del período',
        }[kind] || ''
      }
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r = schema.safeParse(data);
          if (!r.success) {
            setError(r.error.issues.map((i) => i.message).join(' '));
            return;
          }
          setError('');
          m.mutate(r.data);
        }}
      >
        {(kind === 'activities' || kind === 'instructors') && (
          <Field label="Nombre *">
            <input required value={data.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
        )}
        {kind === 'instructors' &&
          Object.entries({
            surname: 'Apellido',
            dni: 'DNI',
            phone: 'Teléfono',
            email: 'Email',
            address: 'Dirección',
          }).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type={key === 'email' ? 'email' : 'text'}
                value={data[key]}
                onChange={(e) => patch({ [key]: e.target.value })}
              />
            </Field>
          ))}
        {kind === 'offerings' && (
          <Field label="Actividad del catálogo">
            <select
              disabled={!!v.id}
              value={data.activity_id || 0}
              onChange={(e) => {
                const a = catalog.find((a) => a.id === Number(e.target.value));
                patch({ activity_id: a?.id || 0, mode: a?.mode || 'group', days: a?.days || [] });
              }}
            >
              <option value={0}>Seleccionar</option>
              {catalog
                .filter((a) => a.active || a.id === v.activity_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {(kind === 'activities' || kind === 'offerings') && (
          <>
            <Field
              label={
                kind === 'activities'
                  ? 'Modalidad sugerida para nuevas ofertas'
                  : 'Modalidad del período'
              }
            >
              <select
                disabled={kind === 'offerings' && !!v.ever_used}
                value={data.mode}
                onChange={(e) => patch({ mode: e.target.value })}
              >
                <option value="group">Grupal</option>
                <option value="individual">Individual · capacidad 1</option>
              </select>
            </Field>
            <p>
              {kind === 'activities'
                ? 'Días sugeridos para nuevas ofertas'
                : 'Días permitidos en este período'}
            </p>
            <div className="day-buttons">
              {days.map((d, n) => (
                <button
                  key={d}
                  type="button"
                  className={data.days.includes(n) ? 'selected' : ''}
                  onClick={() =>
                    patch({
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
          </>
        )}
        {kind === 'schedules' && (
          <>
            {locked && (
              <p className="info">
                Este horario fue utilizado. Conservá su historial; creá otro si cambian día, horas o
                facilitadores. Podés deshabilitarlo para nuevas inscripciones.
              </p>
            )}
            <Field label="Día">
              <select
                disabled={locked}
                value={data.day}
                onChange={(e) => patch({ day: Number(e.target.value) })}
              >
                <option value={-1}>Seleccionar</option>
                {days.map((d, n) => (
                  <option disabled={!offering?.days.includes(n)} key={d} value={n}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              {['start', 'end'].map((k) => (
                <Field key={k} label={k === 'start' ? 'Hora inicio' : 'Hora fin'}>
                  <select
                    disabled={locked}
                    value={data[k]}
                    onChange={(e) => patch({ [k]: e.target.value })}
                  >
                    {times.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <fieldset disabled={locked}>
              <legend>Facilitadores simultáneos (opcional)</legend>
              {teachers
                .filter((i) => i.active || data.instructor_ids.includes(i.id))
                .map((i) => (
                  <label className="check" key={i.id}>
                    <input
                      type="checkbox"
                      checked={data.instructor_ids.includes(i.id)}
                      onChange={(e) =>
                        patch({
                          instructor_ids: e.target.checked
                            ? [...data.instructor_ids, i.id]
                            : data.instructor_ids.filter((id: number) => id !== i.id),
                        })
                      }
                    />
                    {facilitatorName(i)}
                    {!i.active ? ' · Inactivo' : ''}
                  </label>
                ))}
            </fieldset>
          </>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={data.active}
            onChange={(e) => patch({ active: e.target.checked })}
          />
          {kind === 'offerings'
            ? 'Ofrecida este período'
            : kind === 'schedules'
              ? 'Habilitado para nuevas inscripciones'
              : 'Activo'}
        </label>
        <ErrorBox error={error ? new Error(error) : m.error} />
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
