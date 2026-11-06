import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { api } from './api';
import { usePeriod } from './App';
import { RecurringExpenses } from './RecurringExpenses';
import { CardsSkeleton, QueryFeedback } from './LoadingViews';
import {
  DeleteButton,
  Empty,
  ErrorBox,
  Field,
  Modal,
  SaveButton,
  useSave,
  PageHeading,
} from './components';
import { CommandForm } from './SpecialEvents';
import {
  eventVoidSchema,
  type EventListItem,
  type SpecialEventDetail,
} from '../shared/special-events';
import { formatDate, formatMoney } from '../shared/domain';
import {
  associatedExpenseSchema,
  expenseCategorySchema,
  expenseSchemaForPeriod,
  type Expense,
  type ExpenseCategory,
} from '../shared/expenses';

function CategoryForm({
  path,
  category,
  close,
}: {
  path: string;
  category: ExpenseCategory | null;
  close: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<
    z.input<typeof expenseCategorySchema>,
    unknown,
    z.output<typeof expenseCategorySchema>
  >({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: { name: category?.name || '' },
  });
  const mutation = useSave(
    category ? `${path}/${category.id}` : path,
    category ? 'PUT' : 'POST',
    close,
  );
  return (
    <Modal title={category ? 'Modificar categoría' : 'Nueva inversión'} close={close}>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <Field label="Título" error={errors.name?.message}>
          <input {...register('name')} required maxLength={200} autoFocus />
        </Field>
        <ErrorBox error={mutation.error} />
        <div className="actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <SaveButton pending={mutation.isPending} />
        </div>
      </form>
    </Modal>
  );
}

export function ExpenseForm({
  path,
  month,
  expense,
  close,
}: {
  path: string;
  month: string;
  expense?: Expense;
  close: () => void;
}) {
  const { periods } = usePeriod();
  const sourcePeriod = Number(/periods\/(\d+)/.exec(path)?.[1]);
  const category = Number(/expense-categories\/(\d+)/.exec(path)?.[1]);
  const [linked, setLinked] = useState<number | null>(expense?.special_event_id ?? null);
  const [target, setTarget] = useState(sourcePeriod),
    [targetCategory, setTargetCategory] = useState(category);
  const [values, setValues] = useState({
    concept: expense?.concept ?? '',
    date: expense?.date ?? initialExpenseDate(month),
    amount: expense?.amount ?? '',
    notes: expense?.notes ?? '',
  });
  const [error, setError] = useState<unknown>();
  const events = useQuery({
    queryKey: ['special-events', 'list', sourcePeriod],
    queryFn: () => api<EventListItem[]>('/special-events?period_id=' + sourcePeriod),
  });
  const commandEvent = expense?.special_event_id ?? linked;
  const detail = useQuery({
    queryKey: ['special-events', 'detail', commandEvent],
    queryFn: () => api<SpecialEventDetail>('/special-events/' + commandEvent),
    enabled: !!commandEvent,
  });
  const categories = useQuery({
    queryKey: ['expense-categories', target],
    queryFn: () => api<ExpenseCategory[]>('/periods/' + target + '/expense-categories'),
    enabled: !!expense?.special_event_id && linked === null,
  });
  const ordinary = useSave(
    expense ? path + '/' + expense.id : path,
    expense ? 'PUT' : 'POST',
    close,
  );
  const field = (name: keyof typeof values, label: string, type = 'text') => (
    <Field label={label}>
      <input
        name={name}
        type={type}
        value={values[name]}
        required
        maxLength={name === 'concept' ? 200 : undefined}
        inputMode={name === 'amount' ? 'decimal' : undefined}
        onChange={(e) => setValues({ ...values, [name]: e.target.value })}
      />
    </Field>
  );
  const fields = (
    <>
      {field('concept', 'Concepto')}
      <Field label="Evento asociado">
        <select
          value={linked ?? ''}
          onChange={(e) => setLinked(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Gasto general</option>
          {events.data?.map((e) => (
            <option
              key={e.id}
              value={e.id}
              disabled={!!expense?.special_event_id && e.id !== expense.special_event_id}
            >
              {e.name}
              {e.status === 'cancelled' ? ' · Cancelado' : ''}
            </option>
          ))}
        </select>
      </Field>
      {events.error && <ErrorBox error={events.error} />}
      {!!expense?.special_event_id && linked === null && (
        <>
          <p className="info">
            Se conserva el gasto y su fecha real. Elegí un período abierto que corresponda a esa
            fecha y una categoría adicional.
          </p>
          <Field label="Período del gasto general">
            <select
              value={target}
              onChange={(e) => {
                setTarget(Number(e.target.value));
                setTargetCategory(0);
              }}
            >
              {periods
                .filter((p) => p.status === 'open')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.year}-{String(p.month).padStart(2, '0')}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Categoría destino">
            <select
              value={targetCategory}
              onChange={(e) => setTargetCategory(Number(e.target.value))}
              required
            >
              <option value="">Seleccionar</option>
              {categories.data
                ?.filter((c) => !c.recurring_concept_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <ErrorBox error={categories.error} />
        </>
      )}
      <div className="form-grid">
        {field('date', 'Fecha real', 'date')}
        {field('amount', 'Monto')}
      </div>
      {linked !== null && (
        <p className="muted">Se imputa al período del evento; admite una fecha real anterior.</p>
      )}
      <Field label="Comentario">
        <textarea
          name="notes"
          maxLength={2000}
          value={values.notes}
          onChange={(e) => setValues({ ...values, notes: e.target.value })}
        />
      </Field>
    </>
  );
  if (commandEvent) {
    if (!detail.data)
      return (
        <Modal title="Consultar evento asociado" close={close}>
          <p>Consultando evento…</p>
          <ErrorBox error={detail.error} />
        </Modal>
      );
    return (
      <CommandForm
        title={expense ? 'Editar gasto asociado' : 'Nuevo gasto asociado'}
        close={close}
        path={'/special-events/' + commandEvent + '/expenses' + (expense ? '/' + expense.id : '')}
        method={expense ? 'PATCH' : 'POST'}
        revision={detail.data.revision}
        schema={associatedExpenseSchema}
        done={close}
        values={() => ({
          ...values,
          amount: values.amount.replace(',', '.'),
          special_event_id: linked,
          period_id: linked ? sourcePeriod : target,
          category_id: linked ? category : targetCategory,
        })}
      >
        {fields}
      </CommandForm>
    );
  }
  return (
    <Modal title={expense ? 'Editar gasto' : 'Nuevo gasto'} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = expenseSchemaForPeriod(month).safeParse({
            ...values,
            amount: values.amount.replace(',', '.'),
          });
          if (!parsed.success) {
            setError(new Error(parsed.error.issues.map((i) => i.message).join(' ')));
            return;
          }
          ordinary.mutate(parsed.data);
        }}
      >
        {fields}
        <ErrorBox error={error ?? ordinary.error} />
        <div className="actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <SaveButton pending={ordinary.isPending} />
        </div>
      </form>
    </Modal>
  );
}

function DeleteCategory({
  path,
  category,
  close,
}: {
  path: string;
  category: ExpenseCategory;
  close: () => void;
}) {
  const mutation = useSave(path, 'DELETE', close);
  return (
    <Modal title="Eliminar categoría" close={close}>
      <p>
        ¿Querés eliminar la categoría «{category.name}»? Se eliminarán también todos sus gastos.
        Esta acción no se puede deshacer.
      </p>
      <ErrorBox error={mutation.error} />
      <div className="actions">
        <button onClick={close}>Cancelar</button>
        <button
          className="danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(undefined)}
        >
          {mutation.isPending ? 'Procesando…' : 'Sí, eliminar'}
        </button>
      </div>
    </Modal>
  );
}

export function Expenses() {
  const { period, periods } = usePeriod();
  const selected = periods.find((p) => p.id === period);
  const closed = selected?.status === 'closed';
  const month = selected ? `${selected.year}-${String(selected.month).padStart(2, '0')}` : '';
  return (
    <PeriodExpenses key={`${period}-${closed}`} period={period} month={month} closed={closed} />
  );
}

function PeriodExpenses({
  period,
  month,
  closed,
}: {
  period: number;
  month: string;
  closed: boolean;
}) {
  const path = `/periods/${period}/expense-categories`;
  const query = useQuery({
    queryKey: ['expense-categories', period],
    queryFn: () => api<ExpenseCategory[]>(path),
    enabled: !!period,
  });
  const [category, setCategory] = useState<ExpenseCategory | null>();
  const [movement, setMovement] = useState<{ categoryId: number; expense?: Expense }>();
  const [remove, setRemove] = useState<ExpenseCategory>();
  const [removeLinked, setRemoveLinked] = useState<Expense>();
  const disabled = !period || !month || closed || query.isPending || !!query.error;
  const addExpenseButton = (categoryId: number) => (
    <button
      className="primary expense-add"
      aria-label="Agregar gasto a esta categoría"
      title="Agregar gasto a esta categoría"
      disabled={disabled}
      onClick={() => setMovement({ categoryId })}
    >
      <Plus size={17} aria-hidden="true" />
    </button>
  );
  return (
    <>
      <PageHeading
        title="Gastos Período"
        description="Organizá los gastos del período por categorías."
      >
        <button className="primary" disabled={disabled} onClick={() => setCategory(null)}>
          <Plus size={17} /> Nueva inversión
        </button>
      </PageHeading>
      {closed && (
        <p className="info">
          Período cerrado: consulta histórica. Para modificarlo, reabrilo desde Configuración.
        </p>
      )}
      {!period ? (
        <Empty>Creá o seleccioná un período.</Empty>
      ) : (
        <>
          <RecurringExpenses period={period} month={month} closed={closed} />
          <h2>Gastos adicionales</h2>
          <QueryFeedback query={query} label="categorías y gastos adicionales" />
          {query.isPending && <CardsSkeleton label="Cargando categorías y gastos adicionales…" />}
          {query.data
            ?.filter((item) => !item.recurring_concept_id)
            .map((item) => (
              <section className="panel expense-category" key={item.id}>
                <div className="section-heading">
                  <h2>{item.name}</h2>
                  <div className="actions">
                    <button disabled={disabled} onClick={() => setCategory(item)}>
                      Modificar
                    </button>
                    <button
                      className="danger subtle"
                      disabled={disabled}
                      onClick={() => setRemove(item)}
                    >
                      Eliminar
                    </button>
                    {!item.expenses.length && addExpenseButton(item.id)}
                  </div>
                </div>
                {item.expenses.map((expense, index) => (
                  <div className="payment-row" key={expense.id}>
                    <div className="expense-description">
                      <b>
                        {expense.concept} ·{' '}
                        <span className="expense-amount">{formatMoney(expense.amount)}</span>
                      </b>
                      <small>{formatDate(expense.date)}</small>
                      {expense.notes && <p>{expense.notes}</p>}
                    </div>
                    <div className="actions">
                      <button
                        disabled={disabled}
                        onClick={() => setMovement({ categoryId: item.id, expense })}
                      >
                        Editar
                      </button>
                      {expense.special_event_id ? (
                        <>
                          <Link to={'/eventos/' + expense.special_event_id}>Ver evento</Link>
                          <button
                            className="danger subtle"
                            disabled={disabled}
                            onClick={() => setRemoveLinked(expense)}
                          >
                            Eliminar
                          </button>
                        </>
                      ) : (
                        <DeleteButton
                          disabled={disabled}
                          path={`${path}/${item.id}/expenses/${expense.id}`}
                        />
                      )}
                      {index === item.expenses.length - 1 && addExpenseButton(item.id)}
                    </div>
                  </div>
                ))}
                {!item.expenses.length && <p className="muted">Sin gastos registrados.</p>}
              </section>
            ))}
          {query.isSuccess &&
            query.data?.filter((item) => !item.recurring_concept_id).length === 0 && (
              <Empty>
                <span className="desktop-only">No hay categorías de gastos en este período.</span>
                <span className="mobile-only">No hay gastos registrados en este período.</span>
              </Empty>
            )}
        </>
      )}
      {removeLinked && !closed && (
        <DeleteLinkedExpense expense={removeLinked} close={() => setRemoveLinked(undefined)} />
      )}
      {category !== undefined && !closed && (
        <CategoryForm path={path} category={category} close={() => setCategory(undefined)} />
      )}
      {movement && !closed && (
        <ExpenseForm
          path={`${path}/${movement.categoryId}/expenses`}
          month={month}
          expense={movement.expense}
          close={() => setMovement(undefined)}
        />
      )}
      {remove && !closed && (
        <DeleteCategory
          path={`${path}/${remove.id}`}
          category={remove}
          close={() => setRemove(undefined)}
        />
      )}
    </>
  );
}

function DeleteLinkedExpense({ expense, close }: { expense: Expense; close: () => void }) {
  const detail = useQuery({
    queryKey: ['special-events', 'detail', expense.special_event_id],
    queryFn: () => api<SpecialEventDetail>('/special-events/' + expense.special_event_id),
  });
  if (!detail.data)
    return (
      <Modal title="Eliminar gasto" close={close}>
        <QueryFeedback query={detail} label="gasto asociado" />
      </Modal>
    );
  return (
    <CommandForm
      submitLabel="Eliminar gasto"
      title="Eliminar gasto"
      close={close}
      done={close}
      path={'/special-events/' + expense.special_event_id + '/expenses/' + expense.id + '/void'}
      revision={detail.data.revision}
      schema={eventVoidSchema}
      values={() => ({ reason: 'Eliminación administrativa de gasto' })}
    >
      <p>
        ¿Eliminar {expense.concept} por {formatMoney(expense.amount)}?
      </p>
    </CommandForm>
  );
}

export function initialExpenseDate(month: string, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return today.startsWith(month) ? today : month + '-01';
}
