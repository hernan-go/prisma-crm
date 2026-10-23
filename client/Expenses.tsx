import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { api } from './api';
import { usePeriod } from './App';
import { RecurringExpenses } from './RecurringExpenses';
import {
  DeleteButton,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  SaveButton,
  useSave,
  PageHeading,
} from './components';
import { formatDate, formatMoney } from '../shared/domain';
import {
  expenseCategorySchema,
  expenseSchema,
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

function ExpenseForm({
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
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Cordoba',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof expenseSchema>, unknown, z.output<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchemaForPeriod(month)),
    defaultValues: {
      concept: expense?.concept || '',
      date: expense?.date || (today.startsWith(month) ? today : `${month}-01`),
      amount: expense?.amount || '',
      notes: expense?.notes || '',
    },
  });
  const mutation = useSave(
    expense ? `${path}/${expense.id}` : path,
    expense ? 'PUT' : 'POST',
    close,
  );
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return (
    <Modal title={expense ? 'Editar gasto' : 'Nuevo gasto'} close={close}>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
        <Field label="Concepto" error={errors.concept?.message}>
          <input {...register('concept')} required maxLength={200} autoFocus />
        </Field>
        <div className="form-grid">
          <Field label="Fecha" error={errors.date?.message}>
            <input
              {...register('date')}
              type="date"
              required
              min={`${month}-01`}
              max={`${month}-${lastDay}`}
            />
          </Field>
          <Field label="Monto" error={errors.amount?.message}>
            <input
              {...register('amount')}
              type="number"
              required
              min="0.01"
              max="9999999999.99"
              step="0.01"
            />
          </Field>
        </div>
        <Field label="Comentario" error={errors.notes?.message}>
          <textarea {...register('notes')} maxLength={2000} />
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
          <ErrorBox error={query.error} />
          {query.isPending && <Loading />}
          <RecurringExpenses
            period={period}
            month={month}
            closed={closed}
            categories={query.data ?? []}
          />
          <h2>Gastos adicionales</h2>
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
                      <DeleteButton
                        disabled={disabled}
                        path={`${path}/${item.id}/expenses/${expense.id}`}
                      />
                      {index === item.expenses.length - 1 && addExpenseButton(item.id)}
                    </div>
                  </div>
                ))}
                {!item.expenses.length && <p className="muted">Sin gastos registrados.</p>}
              </section>
            ))}
          {query.data?.filter((item) => !item.recurring_concept_id).length === 0 && (
            <Empty>
              <span className="desktop-only">No hay categorías de gastos en este período.</span>
              <span className="mobile-only">No hay gastos registrados en este período.</span>
            </Empty>
          )}
        </>
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
