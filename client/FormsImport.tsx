import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Field, ErrorBox, Modal } from './components';
import { usePeriod, periodName } from './App';
import { formFields, formRowSchema, formsSourceColumns } from '../shared/forms';
import { days, wallet } from '../shared/domain';
import { scheduleConflict, type Booking } from '../shared/schedule';
export function FormsImport() {
  const { period, periods } = usePeriod();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<any>();
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('all');
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<any>();
  const [requestId, setRequestId] = useState('');
  const [loadedPeriod, setLoadedPeriod] = useState(0);
  const qc = useQueryClient();
  const agenda = useQuery({
    queryKey: ['forms-agenda', loadedPeriod],
    queryFn: () => api(`/enrollments?period_id=${loadedPeriod}`),
    enabled: !!loadedPeriod,
  });
  const scheduleError = (row: any) => {
    const currentIndex = rows.indexOf(row);
    const personId = row.action === 'create' ? -(currentIndex + 1) : row.target_id;
    const existing: Booking[] = (agenda.data || []).flatMap((e: any) =>
      e.slots.map((s: any) => ({
        ...e,
        ...s,
        instructor_ids: s.instructors.map((i: any) => i.id),
        mode: e.mode,
      })),
    );
    for (let i = 0; i < rows.length; i++) {
      const other = rows[i];
      if (other === row || other.action === 'skip') continue;
      for (const s of other.selections.filter((s: any) => s.include)) {
        const a = preview?.activities.find((a: any) => a.id === s.activity_id);
        if (a)
          existing.push({
            ...s,
            person_id: other.action === 'create' ? -(i + 1) : other.target_id,
            activity: a.name,
            mode: a.mode,
          });
      }
    }
    for (const s of row.selections.filter((s: any) => s.include)) {
      const a = preview?.activities.find((a: any) => a.id === s.activity_id);
      if (!a || !s.schedule_id || !a.days.includes(s.day))
        return 'Seleccioná un horario configurado de la oferta del período.';
      const next = { ...s, person_id: personId, activity: a.name, mode: a.mode };
      const same = (b: Booking) =>
        row.action !== 'create' &&
        b.person_id === personId &&
        b.schedule_id === s.schedule_id &&
        b.activity_id === s.activity_id &&
        b.day === s.day &&
        b.start === s.start &&
        b.end === s.end;
      const conflict = scheduleConflict(
        next,
        existing.filter((b) => !same(b)),
      );
      if (conflict) return conflict;
      existing.push(next);
    }
    return '';
  };
  const valid = (r: any) =>
    formRowSchema.safeParse({ ...r, reviewed: true }).success && !scheduleError(r);
  const load = useMutation({
    mutationFn: (remap: boolean) => {
      const f = new FormData();
      f.append('file', file!);
      f.append('period_id', String(period));
      if (remap) f.append('mapping', JSON.stringify(mapping));
      return api('/forms-import/preview', 'POST', f);
    },
    onSuccess: (p) => {
      setPreview(p);
      setMapping(p.mapping);
      setRows(p.rows);
      setIndex(0);
      setFilter('all');
      setResult(undefined);
      setRequestId(crypto.randomUUID());
      setLoadedPeriod(period);
    },
  });
  const commit = useMutation({
    mutationFn: () =>
      api('/forms-import/commit', 'POST', {
        period_id: loadedPeriod,
        request_id: requestId,
        confirmed: true,
        rows,
      }),
    onSuccess: (r) => {
      setResult(r);
      setConfirm(false);
      setRows([]);
      setPreview(undefined);
      void qc.invalidateQueries();
    },
  });
  const update = (i: number, patch: any) => {
    setRows((current) =>
      current.map((r, n) => (n === i ? { ...r, ...patch, reviewed: false } : r)),
    );
    setRequestId(crypto.randomUUID());
    commit.reset();
  };
  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.action !== 'skip' && !r.reviewed).length,
    reviewed: rows.filter((r) => r.action !== 'skip' && r.reviewed).length,
    errors: rows.filter((r) => r.action !== 'skip' && !valid(r)).length,
    duplicates: rows.filter((r) => r.matches.length || r.duplicate_lines.length).length,
    skip: rows.filter((r) => r.action === 'skip').length,
  };
  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(
      ({ r }) =>
        filter === 'all' ||
        (filter === 'pending' && r.action !== 'skip' && !r.reviewed) ||
        (filter === 'reviewed' && r.reviewed && r.action !== 'skip') ||
        (filter === 'errors' && r.action !== 'skip' && !valid(r)) ||
        (filter === 'duplicates' && (r.matches.length || r.duplicate_lines.length)) ||
        (filter === 'skip' && r.action === 'skip'),
    );
  const current = visible[Math.min(index, Math.max(0, visible.length - 1))];
  const selected = rows.filter((r) => r.action !== 'skip');
  const ready =
    selected.length > 0 &&
    selected.every((r) => r.reviewed && valid(r)) &&
    loadedPeriod === period &&
    !load.isPending &&
    !agenda.isPending &&
    !agenda.error;
  const periodLabel = periodName(periods.find((p) => p.id === loadedPeriod));
  return (
    <>
      <Link className="back" to="/importar">
        ← Importador genérico XLSX / CSV
      </Link>
      <h1>Importar inscripciones desde Google Forms PRISMA</h1>
      <p>Preferí CSV. Revisá cada persona, su inscripción y cualquier pago antes de confirmar.</p>
      <section className="panel">
        <Field label="CSV de respuestas (hasta 5 MB)">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              setFile(e.target.files?.[0]);
              setPreview(undefined);
              setRows([]);
            }}
          />
        </Field>
        <p>
          Destino:{' '}
          {periodName(periods.find((p) => p.id === period)) || 'Seleccioná un período abierto'}
        </p>
        <button
          className="primary"
          disabled={!file || !period || load.isPending}
          onClick={() => load.mutate(false)}
        >
          Leer respuestas
        </button>
        <ErrorBox error={load.error} />
      </section>
      {result && (
        <section className="panel" role="status">
          <h2>Importación completada</h2>
          <p>
            {result.created} creadas · {result.updated} actualizadas · {result.kept} conservadas ·{' '}
            {result.skipped} omitidas · {result.enrollments} inscripciones procesadas ·{' '}
            {result.payments} pagos
          </p>
        </section>
      )}
      {preview && (
        <>
          <details className="panel">
            <summary>Correspondencia de columnas · se puede corregir manualmente</summary>
            <div className="form-grid">
              {Object.entries(formFields).map(([k, label]) => (
                <Field key={k} label={label}>
                  <select
                    value={mapping[k] ?? -1}
                    onChange={(e) => setMapping({ ...mapping, [k]: Number(e.target.value) })}
                  >
                    <option value={-1}>No usar</option>
                    {formsSourceColumns(preview.headers).map(({ header, index }) => (
                      <option key={index} value={index}>
                        {header || `Columna ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <button disabled={load.isPending} onClick={() => load.mutate(true)}>
              Aplicar mapeo y reiniciar revisión
            </button>
          </details>
          <section className="panel review-summary">
            <b>
              {counts.reviewed} de {selected.length} seleccionadas revisadas · {periodLabel}
            </b>
            <div className="review-filters">
              {Object.entries({
                all: 'Todas',
                pending: 'Pendientes',
                reviewed: 'Revisadas',
                errors: 'Errores',
                duplicates: 'Duplicados',
                skip: 'Omitidas',
              }).map(([k, label]) => (
                <button
                  className={filter === k ? 'selected' : ''}
                  key={k}
                  onClick={() => {
                    setFilter(k);
                    setIndex(0);
                  }}
                >
                  {label} ({counts[k as keyof typeof counts]})
                </button>
              ))}
            </div>
            {loadedPeriod !== period && (
              <p className="error">Cambió el período. Volvé a leer el archivo para ese destino.</p>
            )}
            <button
              className="primary"
              disabled={!ready || commit.isPending}
              onClick={() => setConfirm(true)}
            >
              Confirmar importación
            </button>
          </section>
          {current ? (
            (() => {
              const { r, i } = current;
              const validation = formRowSchema.safeParse({ ...r, reviewed: true });
              return (
                <article className="panel import-review" key={i}>
                  <div className="section-heading">
                    <h2>
                      Respuesta {i + 1} de {rows.length} · fila {r.line}
                    </h2>
                    <span className="chip">
                      {r.action === 'skip' ? 'Omitida' : r.reviewed ? 'Revisada' : 'Pendiente'}
                    </span>
                  </div>
                  {r.review && (
                    <p className="warning">
                      Separación de nombre y apellido sugerida automáticamente. Revisá nombres y
                      apellidos compuestos.
                    </p>
                  )}
                  {r.matches.map((p: any) => (
                    <div className="info" key={p.id}>
                      <b>PERSONA EXISTENTE</b>
                      <p>
                        {p.public_id} {p.nombre} {p.apellido} ·{' '}
                        <Link target="_blank" to={`/personas/${p.id}`}>
                          Ver persona
                        </Link>
                      </p>
                    </div>
                  ))}
                  {!!r.duplicate_lines.length && (
                    <p className="warning">
                      Coincide con otra respuesta: fila {r.duplicate_lines.join(', ')}. Omití el
                      duplicado o resolvelo antes de confirmar.
                    </p>
                  )}
                  <div className="form-grid">
                    {Object.entries({
                      nombre: 'Nombre',
                      apellido: 'Apellido',
                      telefono: 'Teléfono',
                      dni: 'DNI',
                      email: 'Email',
                      direccion: 'Dirección',
                      observaciones: 'Observaciones',
                    }).map(([k, label]) => (
                      <Field key={k} label={label}>
                        <input
                          value={r.person[k] || ''}
                          onChange={(e) =>
                            update(i, { person: { ...r.person, [k]: e.target.value } })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <Field label="Acción sobre la persona">
                    <select
                      value={r.action}
                      onChange={(e) => update(i, { action: e.target.value })}
                    >
                      <option value="skip">Omitir respuesta</option>
                      <option value="create">Crear nueva persona (sin coincidencias)</option>
                      {r.matches.length > 0 && (
                        <>
                          <option value="keep">
                            Conservar datos actuales y agregar inscripciones
                          </option>
                          <option value="update">Actualizar datos y agregar inscripciones</option>
                        </>
                      )}
                    </select>
                  </Field>
                  {(r.action === 'keep' || r.action === 'update') && (
                    <Field label="Persona existente">
                      <select
                        value={r.target_id || 0}
                        onChange={(e) => update(i, { target_id: Number(e.target.value) })}
                      >
                        {r.matches.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.public_id} {p.nombre} {p.apellido}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {r.action === 'update' && (
                    <p className="warning">
                      Reemplaza los campos personales mostrados, incluidos vacíos. Conserva contacto
                      de emergencia y estado.
                    </p>
                  )}
                  <h3>Actividades y horarios</h3>
                  {r.selections.map((s: any, n: number) => {
                    const patch = (v: any) =>
                      update(i, {
                        selections: r.selections.map((x: any, j: number) =>
                          j === n ? { ...x, ...v } : x,
                        ),
                      });
                    return (
                      <section className="slot-editor" key={n}>
                        <p>Original: {s.original || 'Agregada manualmente'}</p>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={s.include}
                            onChange={(e) => patch({ include: e.target.checked })}
                          />
                          Incluir esta inscripción
                        </label>
                        {s.include && (
                          <>
                            <Field label="Horario del período">
                              <select
                                value={s.schedule_id || 0}
                                onChange={(e) => {
                                  const h = preview.schedules.find(
                                    (x: any) => x.id === Number(e.target.value),
                                  );
                                  patch(
                                    h
                                      ? {
                                          schedule_id: h.id,
                                          activity_id: h.activity_id,
                                          day: h.day,
                                          start: h.start,
                                          end: h.end,
                                          instructor_ids: h.instructors.map((i: any) => i.id),
                                        }
                                      : { schedule_id: 0 },
                                  );
                                }}
                              >
                                <option value={0}>Pendiente: elegir configuración existente</option>
                                {preview.schedules
                                  .filter((h: any) => h.active && h.offered && h.catalog_active)
                                  .map((h: any) => (
                                    <option key={h.id} value={h.id}>
                                      {h.activity} · {days[h.day]} {h.start}–{h.end} ·{' '}
                                      {h.instructors.map((i: any) => i.name).join(' + ') ||
                                        'Sin facilitadores'}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                            <p className="muted">
                              Si falta el horario, configurarlo manualmente en Actividades del
                              período y volver a leer el archivo. El importador nunca crea
                              facilitadores ni horarios.
                            </p>
                          </>
                        )}
                      </section>
                    );
                  })}
                  <button
                    onClick={() =>
                      update(i, {
                        selections: [
                          ...r.selections,
                          {
                            original: '',
                            include: true,
                            activity_id: 0,
                            schedule_id: 0,
                            instructor_ids: [],
                            day: -1,
                            start: '',
                            end: '',
                          },
                        ],
                      })
                    }
                  >
                    Agregar actividad / día
                  </button>
                  <section className="payment-review">
                    <h3>Pago detectado</h3>
                    <p>Texto original: {r.payment.original || 'Sin pago informado'}</p>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={r.payment.include}
                        onChange={(e) =>
                          update(i, {
                            payment: { ...r.payment, include: e.target.checked, approved: false },
                          })
                        }
                      />
                      Incluir este pago
                    </label>
                    {r.payment.include && (
                      <>
                        <div className="form-grid">
                          {(['amount', 'method', 'date'] as const).map((k) => (
                            <Field
                              key={k}
                              label={
                                {
                                  amount: 'Monto (ARS)',
                                  method: 'Medio',
                                  date: 'Fecha (revisar año sugerido)',
                                }[k]
                              }
                            >
                              {k === 'method' ? (
                                <select
                                  value={r.payment.method}
                                  onChange={(e) =>
                                    update(i, {
                                      payment: {
                                        ...r.payment,
                                        method: e.target.value,
                                        approved: false,
                                      },
                                    })
                                  }
                                >
                                  <option value="">Seleccionar</option>
                                  <option value="transfer">Transferencia</option>
                                  <option value="cash">Efectivo</option>
                                </select>
                              ) : (
                                <input
                                  type={k === 'date' ? 'date' : 'number'}
                                  step={k === 'amount' ? '0.01' : undefined}
                                  value={r.payment[k]}
                                  onChange={(e) =>
                                    update(i, {
                                      payment: {
                                        ...r.payment,
                                        [k]: e.target.value,
                                        approved: false,
                                      },
                                    })
                                  }
                                />
                              )}
                            </Field>
                          ))}
                        </div>
                        <p>
                          Cartera:{' '}
                          {r.payment.method ? wallet(r.payment.method) : 'Seleccioná el medio'}
                        </p>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={r.payment.approved}
                            onChange={(e) =>
                              update(i, { payment: { ...r.payment, approved: e.target.checked } })
                            }
                          />
                          Apruebo expresamente monto, medio y fecha de este pago.
                        </label>
                      </>
                    )}
                  </section>
                  {!validation.success && r.action !== 'skip' && (
                    <div className="error-box">
                      {validation.error.issues.map((e) => e.message).join(' ')}
                    </div>
                  )}
                  {r.action !== 'skip' && (
                    <ErrorBox
                      error={scheduleError(r) ? new Error(scheduleError(r)) : agenda.error}
                    />
                  )}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={r.reviewed}
                      disabled={!valid(r) && r.action !== 'skip'}
                      onChange={(e) =>
                        setRows(
                          rows.map((x, j) => (j === i ? { ...x, reviewed: e.target.checked } : x)),
                        )
                      }
                    />
                    Revisé la persona, inscripciones, exclusiones y pago de esta respuesta.
                  </label>
                  <div className="pagination">
                    <button disabled={!index} onClick={() => setIndex(index - 1)}>
                      Anterior
                    </button>
                    <span>
                      {Math.min(index + 1, visible.length)} / {visible.length}
                    </span>
                    <button
                      disabled={index + 1 >= visible.length}
                      onClick={() => setIndex(index + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                </article>
              );
            })()
          ) : (
            <p>No hay respuestas en este filtro.</p>
          )}
        </>
      )}
      {confirm && (
        <Modal title="Confirmar lote revisado" close={() => setConfirm(false)}>
          <p>
            Destino: {periodLabel}. {selected.length} personas seleccionadas. Se guardarán solo las
            inscripciones incluidas y pagos expresamente aprobados. Ante cualquier conflicto, se
            revierte todo el lote.
          </p>
          <ErrorBox error={commit.error} />
          <div className="actions">
            <button disabled={commit.isPending} onClick={() => setConfirm(false)}>
              Volver
            </button>
            <button
              className="primary"
              disabled={!ready || commit.isPending}
              onClick={() => commit.mutate()}
            >
              Importar ahora
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
