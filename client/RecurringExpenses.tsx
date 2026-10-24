import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  House,
  Building2,
  Zap,
  Flame,
  Wifi,
  Droplets,
  Landmark,
  HeartPulse,
  Receipt,
  Pencil,
  Settings2,
} from 'lucide-react';
import { Decimal } from 'decimal.js';
import { api } from './api';
import { Modal, Field, ErrorBox, SaveButton, useSave } from './components';
import { CardsSkeleton, ListSkeleton, QueryFeedback } from './LoadingViews';
import {
  recurringIcons,
  type RecurringTile,
  type RecurringConcept,
  type RecurringSnapshot,
} from '../shared/recurring-expenses';
import type { ExpenseCategory } from '../shared/expenses';
import { statisticsMoney } from '../shared/statistics';
import { formatDate } from '../shared/domain';
import './recurring-expenses.css';

function expectedExpense(tile: RecurringTile) {
  const e = tile.expenses[0];
  return e
    ? { id: e.id, concept: e.concept, date: e.date, amount: e.amount, notes: e.notes }
    : null;
}
const icons = {
  house: House,
  'building-2': Building2,
  zap: Zap,
  flame: Flame,
  wifi: Wifi,
  droplets: Droplets,
  landmark: Landmark,
  'heart-pulse': HeartPulse,
  receipt: Receipt,
};

function MonthlyForm({
  tile,
  period,
  month,
  periodLabel,
  close,
}: {
  tile: RecurringTile;
  period: number;
  month: string;
  periodLabel: string;
  close: () => void;
}) {
  const current = tile.status === 'single' ? tile.expenses[0] : undefined;
  const [amount, setAmount] = useState(current?.amount ?? '');
  const date = current?.date ?? '';
  const [notes, setNotes] = useState(current?.notes ?? '');
  const save = useSave(`/periods/${period}/recurring-expenses/${tile.id}`, 'PUT', close);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const remove = useSave(
    `/periods/${period}/recurring-expenses/${tile.id}/amount`,
    'DELETE',
    close,
  );
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  return (
    <Modal
      title={`${current ? 'Corregir' : 'Cargar'} ${tile.category_name ?? tile.name}`}
      close={close}
    >
      {confirmRemoval && current ? (
        <div>
          <p>
            Vas a quitar el importe de <b>{tile.category_name ?? tile.name}</b> de{' '}
            <b>{periodLabel}</b>: {statisticsMoney(current.amount)}. Se eliminará únicamente este
            movimiento de este período.
          </p>
          <ErrorBox error={remove.error} />
          <div className="actions">
            <button type="button" onClick={() => setConfirmRemoval(false)}>
              Volver
            </button>
            <button
              className="danger"
              type="button"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate({ revision: tile.revision, expected: expectedExpense(tile) })
              }
            >
              {remove.isPending ? 'Quitando…' : 'Confirmar quitar importe'}
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              revision: tile.revision,
              expense: {
                concept: current?.concept ?? tile.name,
                date: String(new FormData(event.currentTarget).get('date')),
                amount,
                notes,
              },
              expected: current
                ? {
                    id: current.id,
                    concept: current.concept,
                    date: current.date,
                    amount: current.amount,
                    notes: current.notes,
                  }
                : null,
            });
          }}
        >
          <Field label="Importe">
            <input
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              required
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Fecha del gasto">
            <input
              type="date"
              min={`${month}-01`}
              max={`${month}-${lastDay}`}
              name="date"
              required
              defaultValue={date}
            />
          </Field>
          <Field label="Notas">
            <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <ErrorBox error={save.error} />
          <div className="actions">
            <button type="button" onClick={close}>
              Cancelar
            </button>
            {current && tile.status === 'single' && (
              <button type="button" className="danger" onClick={() => setConfirmRemoval(true)}>
                Quitar importe
              </button>
            )}
            <SaveButton pending={save.isPending} />
          </div>
        </form>
      )}
    </Modal>
  );
}

function HistoricalLink({
  tile,
  period,
  close,
}: {
  tile: RecurringTile;
  period: number;
  close: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  // Same key as Expenses: share the real query instead of treating pending categories as [].
  const categories = useQuery({
    queryKey: ['expense-categories', period],
    queryFn: () => api<ExpenseCategory[]>(`/periods/${period}/expense-categories`),
    enabled: !!period,
  });
  const candidate = categories.data?.find((c) => c.id === Number(selected));
  const save = useSave(`/periods/${period}/recurring-expenses/${tile.id}/link`, 'POST', close);
  return (
    <Modal title={`Vincular categoría a ${tile.name}`} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed) save.mutate({ revision: tile.revision, category_id: Number(selected) });
        }}
      >
        <p>
          Revisá los IDs y sus movimientos antes de confirmar. No se fusionan gastos ni se cambian
          sus importes.
        </p>
        <Field label="Categoría del período">
          <select
            required
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setConfirmed(false);
            }}
          >
            <option value="">Seleccionar por ID</option>
            {categories.data
              ?.filter((c) => !c.recurring_concept_id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} · {c.name} ({c.expenses.length} gastos)
                </option>
              ))}
          </select>
        </Field>
        <QueryFeedback query={categories} label="categorías del período" />
        {!!period && categories.isPending && (
          <ListSkeleton label="Cargando categorías del período…" rows={1} />
        )}
        {candidate && (
          <>
            <ul>
              {candidate.expenses.map((e) => (
                <li key={e.id}>
                  #{e.id} · {e.concept} · {formatDate(e.date)} · {statisticsMoney(e.amount)}
                  {e.notes && ` · ${e.notes}`}
                </li>
              ))}
            </ul>
            {candidate.expenses.length > 1 && (
              <p className="info">Quedará en revisión, sin edición simplificada.</p>
            )}
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              Confirmo que esta categoría corresponde al concepto seleccionado.
            </label>
          </>
        )}
        <ErrorBox error={save.error} />
        <div className="actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary" disabled={!candidate || !confirmed || save.isPending}>
            Confirmar vínculo
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Detail({
  tile,
  period,
  closed,
  close,
}: {
  tile: RecurringTile;
  period: number;
  closed: boolean;
  close: () => void;
}) {
  const [link, setLink] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const unlink = useSave(`/periods/${period}/recurring-expenses/${tile.id}/link`, 'DELETE', close);
  if (link) return <HistoricalLink tile={tile} period={period} close={close} />;
  return (
    <Modal title={tile.category_name ?? tile.name} close={close}>
      {tile.category_name && tile.category_name !== tile.name && (
        <p>Concepto vigente: {tile.name}</p>
      )}
      {tile.status === 'review' && (
        <p className="info">
          Revisión pendiente. Estos registros se conservan sin fusionar; el subtotal no es editable.
        </p>
      )}
      {!tile.expenses.length && <p>Sin importe registrado.</p>}
      {tile.expenses.map((e) => (
        <div className="recurring-detail" key={e.id}>
          <b>
            #{e.id} · {statisticsMoney(e.amount)}
          </b>
          <p>
            {e.concept} · {formatDate(e.date)}
          </p>
          {e.notes && <p>{e.notes}</p>}
        </div>
      ))}
      {tile.category_id && (
        <p>
          Categoría #{tile.category_id} · Concepto #{tile.id}
        </p>
      )}
      {!closed && !tile.category_id && (
        <button onClick={() => setLink(true)}>Vincular categoría existente por ID</button>
      )}
      {!closed && tile.category_id && (
        <>
          <label>
            <input
              type="checkbox"
              checked={confirmUnlink}
              onChange={(e) => setConfirmUnlink(e.target.checked)}
            />{' '}
            Desvincular explícitamente esta categoría; conservar sus movimientos en adicionales.
          </label>
          <button
            disabled={!confirmUnlink || unlink.isPending}
            onClick={() =>
              unlink.mutate({ revision: tile.revision, category_id: tile.category_id })
            }
          >
            Confirmar desvinculación
          </button>
          <ErrorBox error={unlink.error} />
        </>
      )}
      <div className="actions">
        <button onClick={close}>Cerrar</button>
      </div>
    </Modal>
  );
}

function ConceptForm({ entry, close }: { entry: RecurringConcept | null; close: () => void }) {
  const [name, setName] = useState(entry?.name ?? '');
  const [icon, setIcon] = useState(entry?.icon_name ?? 'receipt');
  const [active, setActive] = useState(entry?.active ?? true);
  const save = useSave(
    `/expense-recurring-concepts${entry ? `/${entry.id}` : ''}`,
    entry ? 'PUT' : 'POST',
    close,
  );
  return (
    <Modal title={entry ? 'Editar concepto recurrente' : 'Nuevo concepto recurrente'} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ name, icon_name: icon, active });
        }}
      >
        <Field label="Nombre">
          <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Icono">
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value as RecurringConcept['icon_name'])}
          >
            {recurringIcons.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </Field>
        <p className="muted">
          La disponibilidad es general para esta instalación. No quita el concepto de un período que
          ya lo tenga; esa acción requiere configuración mensual propia.
        </p>
        <label>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
          Disponible en el catálogo general
        </label>
        <ErrorBox error={save.error} />
        <div className="actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <SaveButton pending={save.isPending} />
        </div>
      </form>
    </Modal>
  );
}

function Catalogue({ close }: { close: () => void }) {
  const q = useQuery({
    queryKey: ['expense-recurring-concepts'],
    queryFn: () => api<RecurringConcept[]>('/expense-recurring-concepts'),
  });
  const [editing, setEditing] = useState<RecurringConcept | null>();
  const [confirm, setConfirm] = useState(false);
  const preset = useSave('/expense-recurring-concepts/prisma-preset', 'POST', () =>
    setConfirm(false),
  );
  if (editing !== undefined)
    return <ConceptForm entry={editing} close={() => setEditing(undefined)} />;
  return (
    <Modal title="Configurar recurrentes" close={close}>
      <p>Catálogo de esta instalación para todos los períodos. No crea gastos ni copia importes.</p>
      <QueryFeedback query={q} label="catálogo recurrente" />
      {q.isPending && <ListSkeleton label="Cargando catálogo recurrente…" />}
      {q.data?.map((c) => (
        <div className="recurring-catalogue-row" key={c.id}>
          <span>
            #{c.id} · {c.name}
            {!c.active ? ' · Inactivo' : ''}
          </span>
          <button onClick={() => setEditing(c)}>Editar</button>
        </div>
      ))}
      {q.data?.length === 0 && (
        <>
          <p>
            El catálogo está vacío. Podés configurar los ocho conceptos de PRISMA o crear los
            propios.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />{' '}
            Configurar Alquiler, Expensas, Luz, Gas, Internet, Agua, Impuestos y Cobertura médica
            para PRISMA.
          </label>
          <button
            disabled={!confirm || preset.isPending}
            onClick={() => preset.mutate({ confirm: 'PRISMA' })}
          >
            Configurar los ocho de PRISMA
          </button>
          <ErrorBox error={preset.error} />
        </>
      )}
      <div className="actions">
        <button onClick={close}>Cerrar</button>
        <button disabled={!q.data} onClick={() => setEditing(null)}>
          Nuevo concepto
        </button>
      </div>
    </Modal>
  );
}

function PositionRow({
  tile,
  count,
  period,
  closed,
  close,
  remove,
}: {
  tile: RecurringTile;
  count: number;
  period: number;
  closed: boolean;
  close: () => void;
  remove: () => void;
}) {
  const [position, setPosition] = useState(String(tile.position));
  const save = useSave(`/periods/${period}/recurring-expenses/${tile.id}/position`, 'PUT', close);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ revision: tile.revision, position: Number(position) });
      }}
    >
      <b>{tile.category_name ?? tile.name}</b>
      <Field label={`Posición de ${tile.category_name ?? tile.name}`}>
        <input
          type="number"
          min="1"
          max={count}
          step="1"
          required
          value={position}
          disabled={closed}
          onChange={(e) => setPosition(e.target.value)}
        />
      </Field>
      <ErrorBox error={save.error} />
      <div className="actions">
        <button disabled={closed || save.isPending || Number(position) === tile.position}>
          Guardar posición
        </button>
        <button type="button" disabled={closed || tile.status === 'review'} onClick={remove}>
          Quitar del período
        </button>
      </div>
      {tile.status === 'review' && (
        <p className="muted">Históricos en revisión: se conservan sus movimientos.</p>
      )}
    </form>
  );
}

function PeriodConfiguration({
  snapshot,
  period,
  label,
  closed,
  close,
}: {
  snapshot: RecurringSnapshot;
  period: number;
  label: string;
  closed: boolean;
  close: () => void;
}) {
  const [initial] = useState(snapshot);
  const [catalogue, setCatalogue] = useState(false);
  const [selected, setSelected] = useState('');
  const [removing, setRemoving] = useState<RecurringTile>();
  const q = useQuery({
    queryKey: ['expense-recurring-concepts'],
    queryFn: () => api<RecurringConcept[]>('/expense-recurring-concepts'),
  });
  const add = useSave(`/periods/${period}/recurring-expenses/${selected}/presence`, 'POST', close);
  const remove = useSave(
    `/periods/${period}/recurring-expenses/${removing?.id}/presence`,
    'DELETE',
    close,
  );
  if (catalogue) return <Catalogue close={() => setCatalogue(false)} />;
  return (
    <Modal title={`Configurar recurrentes · ${label}`} close={close}>
      {removing ? (
        <>
          <p>
            Vas a quitar <b>{removing.category_name ?? removing.name}</b> de <b>{label}</b>.
          </p>
          <p>
            {removing.expenses.length
              ? `También se eliminará el movimiento #${removing.expenses[0].id} por ${statisticsMoney(removing.expenses[0].amount)} de este período.`
              : 'No tiene importe registrado.'}{' '}
            Podrás reincorporar el concepto sin importe.
          </p>
          <ErrorBox error={remove.error} />
          <div className="actions">
            <button disabled={remove.isPending} onClick={() => setRemoving(undefined)}>
              Cancelar
            </button>
            <button
              className="danger"
              disabled={closed || remove.isPending}
              onClick={() =>
                remove.mutate({ revision: initial.revision, expected: expectedExpense(removing) })
              }
            >
              Confirmar quitar del período
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Conceptos y posiciones exclusivos de {label}.</p>
          {closed && (
            <p className="info">Período cerrado. Reabrilo para modificar su configuración.</p>
          )}
          {initial.tiles.map((tile) => (
            <PositionRow
              key={tile.id}
              tile={tile}
              count={initial.tiles.length}
              period={period}
              closed={closed}
              close={close}
              remove={() => setRemoving(tile)}
            />
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate({ revision: initial.revision });
            }}
          >
            <Field label="Agregar concepto del catálogo">
              <select
                required
                value={selected}
                disabled={closed}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Seleccionar concepto</option>
                {q.data
                  ?.filter((c) => !initial.tiles.some((t) => t.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.active ? '' : ' · Inactivo en catálogo'}
                    </option>
                  ))}
              </select>
            </Field>
            <QueryFeedback query={q} label="catálogo recurrente" />
            {q.isPending && <ListSkeleton label="Cargando catálogo recurrente…" rows={1} />}
            <ErrorBox error={add.error} />
            <button disabled={closed || !selected || add.isPending}>Agregar a este período</button>
          </form>
          <div className="actions">
            <button onClick={() => setCatalogue(true)}>Administrar catálogo reutilizable</button>
            <button onClick={close}>Cerrar</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function RecurringExpenses({
  period,
  month,
  closed,
}: {
  period: number;
  month: string;
  closed: boolean;
}) {
  const q = useQuery({
    queryKey: ['recurring-expenses', period],
    queryFn: () => api<RecurringSnapshot>(`/periods/${period}/recurring-expenses`),
    enabled: !!period,
  });
  const [edit, setEdit] = useState<RecurringTile>();
  const [detail, setDetail] = useState<RecurringTile>();
  const [config, setConfig] = useState(false);
  return (
    <section className="recurring-section" aria-labelledby="recurring-heading">
      <div className="section-heading">
        <h2 id="recurring-heading">Gastos recurrentes</h2>
        <button disabled={!q.data} onClick={() => setConfig(true)}>
          <Settings2 size={17} /> Configurar
        </button>
      </div>
      <QueryFeedback query={q} label="gastos recurrentes" />
      {!!period && q.isPending && <CardsSkeleton label="Cargando gastos recurrentes…" />}
      {q.isSuccess && q.data?.tiles.length === 0 && (
        <p className="muted">Agregá conceptos a este período desde Configurar.</p>
      )}
      <div className="recurring-grid">
        {q.data?.tiles.map((tile) => {
          const Icon = icons[tile.icon_name] ?? Receipt;
          return (
            <article className="recurring-card" key={tile.id}>
              <div className="recurring-card-line">
                <div className="recurring-card-name">
                  <Icon size={18} aria-hidden="true" />
                  <h3>{tile.category_name ?? tile.name}</h3>
                </div>
                <button
                  className="recurring-pencil"
                  aria-label={`${tile.status === 'single' ? 'Corregir' : 'Cargar'} ${tile.category_name ?? tile.name}`}
                  title={closed ? 'Período cerrado' : 'Cargar o corregir importe'}
                  disabled={closed}
                  onClick={() => (tile.status === 'review' ? setDetail(tile) : setEdit(tile))}
                >
                  <Pencil size={16} aria-hidden="true" />
                </button>
              </div>
              <button
                className="recurring-amount"
                onClick={() => setDetail(tile)}
                aria-label={`Consultar ${tile.category_name ?? tile.name}`}
              >
                {tile.amount === null
                  ? '$ —'
                  : statisticsMoney(new Decimal(tile.amount).toFixed(2))}
              </button>
              {tile.status === 'review' && (
                <span className="recurring-review">Subtotal · Revisión pendiente</span>
              )}
            </article>
          );
        })}
      </div>
      {edit && !closed && (
        <MonthlyForm
          tile={edit}
          period={period}
          month={month}
          periodLabel={monthLabel(month)}
          close={() => setEdit(undefined)}
        />
      )}
      {detail && (
        <Detail tile={detail} period={period} closed={closed} close={() => setDetail(undefined)} />
      )}
      {config && q.data && (
        <PeriodConfiguration
          snapshot={q.data}
          period={period}
          label={monthLabel(month)}
          closed={closed}
          close={() => setConfig(false)}
        />
      )}
    </section>
  );
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
}
