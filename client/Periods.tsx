import { useState } from 'react';
import { usePeriod, periodName } from './App';
import { nextPeriod, previousPeriod } from '../shared/schedule';
import { Modal, Field, useSave, ErrorBox, DeleteButton } from './components';
export function PeriodForm({
  close,
  onCreated,
  value,
}: {
  close: () => void;
  onCreated: (id: number) => void;
  value?: any;
}) {
  const { periods } = usePeriod();
  const [data, set] = useState(value || nextPeriod(periods));
  const [mode, setMode] = useState<'empty' | 'clone_previous'>('empty');
  const source = previousPeriod(periods, data);
  const cannotCopy = !value && mode === 'clone_previous' && !source;
  const m = useSave(value ? `/periods/${value.id}` : '/periods', value ? 'PUT' : 'POST', close);
  const exists = periods.some(
    (p) => p.id !== value?.id && p.year === data.year && p.month === data.month,
  );
  const now = new Date();
  const delta = (data.year - now.getFullYear()) * 12 + data.month - now.getMonth() - 1;
  return (
    <Modal title={value ? 'Editar período vacío' : 'Crear nuevo período'} close={close}>
      <p>
        Solo los períodos sin configuración, inscripciones, cuentas ni categorías de gastos pueden
        editarse o eliminarse.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!exists && !cannotCopy)
            m.mutate(value ? data : { year: data.year, month: data.month, mode }, {
              onSuccess: (r) => onCreated(r.id || value?.id),
            });
        }}
      >
        <div className="form-grid">
          <Field label="Año">
            <input
              type="number"
              min="2020"
              max="2100"
              required
              value={data.year}
              onChange={(e) => {
                set({ ...data, year: Number(e.target.value) });
                m.reset();
              }}
            />
          </Field>
          <Field label="Mes">
            <select
              value={data.month}
              onChange={(e) => {
                set({ ...data, month: Number(e.target.value) });
                m.reset();
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {periodName({ year: data.year, month: i + 1 })}
                  {periods.some((p) => p.year === data.year && p.month === i + 1)
                    ? ' — Ya existe'
                    : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {!value && (
          <fieldset>
            <legend>Configuración inicial</legend>
            <label className="check">
              <input
                type="radio"
                name="creation-mode"
                checked={mode === 'empty'}
                onChange={() => {
                  setMode('empty');
                  m.reset();
                }}
              />
              Crear período vacío
            </label>
            <label className="check">
              <input
                type="radio"
                name="creation-mode"
                checked={mode === 'clone_previous'}
                disabled={!source}
                onChange={() => {
                  setMode('clone_previous');
                  m.reset();
                }}
              />
              Copiar configuración del período anterior
            </label>
            <p>
              {source
                ? `Fuente prevista: ${periodName(source)}. Se copiarán ofertas, días, horarios y facilitadores, conservando sus estados. No se copiarán inscripciones, cuentas, pagos ni gastos.`
                : 'No existe un período anterior disponible para copiar configuración.'}
            </p>
          </fieldset>
        )}
        {exists && (
          <p role="alert" className="error">
            Este período ya existe.
          </p>
        )}
        {delta < 0 && <p className="warning">Estás creando un período anterior al mes actual.</p>}
        {delta > 3 && <p className="warning">Este período está varios meses por delante.</p>}
        <ErrorBox error={m.error} />
        <div className="actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={exists || cannotCopy || m.isPending}>
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PeriodAdmin() {
  const { periods } = usePeriod();
  const [edit, setEdit] = useState<any>();
  const [status, setStatus] = useState<any>();
  const m = useSave(`/periods/${status?.id}/status`, 'PATCH', () => setStatus(undefined));
  return (
    <section className="panel">
      <h2>Períodos</h2>
      <p>
        Cerrar conserva el historial y bloquea nuevos movimientos y ediciones. Podés reabrirlo de
        forma explícita.
      </p>
      {periods.map((p) => (
        <div className="payment-row" key={p.id}>
          <span>
            {periodName(p)}{' '}
            <span className="chip">{p.status === 'closed' ? 'Cerrado' : 'Abierto'}</span>
          </span>
          <div className="actions">
            <button onClick={() => setEdit(p)}>Editar vacío</button>
            <button
              onClick={() => {
                m.reset();
                setStatus(p);
              }}
            >
              {p.status === 'closed' ? 'Reabrir' : 'Cerrar período'}
            </button>
            <DeleteButton path={`/periods/${p.id}`} />
          </div>
        </div>
      ))}
      {edit && <PeriodForm value={edit} close={() => setEdit(undefined)} onCreated={() => {}} />}
      {status && (
        <Modal
          title={status.status === 'closed' ? 'Reabrir período' : 'Cerrar período'}
          close={() => setStatus(undefined)}
        >
          <p>{periodName(status)}. Se conservarán todos los datos.</p>
          <ErrorBox error={m.error} />
          <div className="actions">
            <button onClick={() => setStatus(undefined)}>Cancelar</button>
            <button
              className="primary"
              disabled={m.isPending}
              onClick={() => m.mutate({ status: status.status === 'closed' ? 'open' : 'closed' })}
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
