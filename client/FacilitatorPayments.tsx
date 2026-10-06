import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Decimal } from 'decimal.js';
import { api } from './api';
import { usePeriod } from './App';
import {
  DeleteButton,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Modal,
  SaveButton,
  useSave,
} from './components';
import { formatDate, formatMoney, sumMoney } from '../shared/domain';
import {
  facilitatorAccountSchema,
  facilitatorPaymentSchema,
  type FacilitatorAccount,
  type FacilitatorPayment,
} from '../shared/facilitators';

export function FacilitatorPayments() {
  const { period, periods } = usePeriod();
  const closed = periods.find((p) => p.id === period)?.status === 'closed';
  const q = useQuery({
    queryKey: ['facilitator-accounts', period],
    queryFn: () => api<FacilitatorAccount[]>(`/facilitator-accounts?period_id=${period}`),
    enabled: !!period,
  });
  const groups = new Map<number, FacilitatorAccount[]>();
  for (const account of q.data || [])
    groups.set(account.instructor_id, [...(groups.get(account.instructor_id) || []), account]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Pago Facilitadores</h1>
          <p>Importes manuales y movimientos por actividad del período seleccionado.</p>
        </div>
      </div>
      {closed && (
        <p className="info">
          Período cerrado. Reabrilo desde la gestión de períodos para corregir datos.
        </p>
      )}
      <ErrorBox error={q.error} />
      {!!period && q.isPending && <Loading />}
      {!period && <Empty>Seleccioná un período.</Empty>}
      {!!period && !q.isPending && !q.error && !groups.size && (
        <Empty>
          Sin facilitadores en este período. Revisá{' '}
          <Link to="/configuracion">Configuración → Período</Link>.
        </Empty>
      )}
      {[...groups].map(([id, accounts]) => (
        <section className="panel facilitator-block" key={`${period}-${id}`}>
          <h2 className="facilitator-name">{accounts[0].instructor}</h2>
          {accounts.map((account) => (
            <AccountBlock key={`${account.offering_id}-${id}`} account={account} closed={closed} />
          ))}
          <div className="facilitator-totals">
            <span>
              Total a pagar:{' '}
              <b>
                {accounts.some((a) => a.amount_due === null)
                  ? 'No definido'
                  : formatMoney(sumMoney(accounts.map((a) => a.amount_due!)))}
              </b>
            </span>
            <span>
              Total pagado: <b>{formatMoney(sumMoney(accounts.map((a) => a.paid)))}</b>
            </span>
            <span>
              Total pendiente:{' '}
              <b>
                {accounts.some((a) => a.pending === null)
                  ? 'No definido'
                  : formatMoney(sumMoney(accounts.map((a) => a.pending!)))}
              </b>
            </span>
          </div>
          {accounts.some((a) => a.amount_due === null) && (
            <small className="muted">
              Hay actividades con importe a pagar todavía no definido.
            </small>
          )}
        </section>
      ))}
    </>
  );
}
function AccountBlock({ account: a, closed }: { account: FacilitatorAccount; closed: boolean }) {
  const [due, setDue] = useState(false);
  const [payment, setPayment] = useState<Partial<FacilitatorPayment>>();
  const [expanded, setExpanded] = useState(false);
  const q = useQuery({
    queryKey: ['facilitator-payments', a.id],
    queryFn: () => api<FacilitatorPayment[]>(`/facilitator-accounts/${a.id}/payments`),
    enabled: !!a.id && expanded,
  });
  return (
    <article className="facilitator-account">
      <div className="section-heading">
        <h3 className="facilitator-activity-name">{a.activity}</h3>
        <button disabled={closed} onClick={() => setDue(true)}>
          Editar importe / concepto
        </button>
      </div>
      {!a.assigned && (
        <p className="muted">Cuenta histórica: ya no figura en los horarios del período.</p>
      )}
      <div className="facilitator-metrics">
        <div className="facilitator-metric">
          <span>A pagar</span>
          <strong>{a.amount_due === null ? '—' : formatMoney(a.amount_due)}</strong>
        </div>
        <div className="facilitator-metric">
          <span>Pagado</span>
          <strong>{formatMoney(a.paid)}</strong>
        </div>
        <div className="facilitator-metric">
          <span>Pendiente</span>
          <strong>{formatMoney(a.pending)}</strong>
        </div>
      </div>
      {a.notes && (
        <p className="facilitator-notes">
          <span className="muted">Observaciones / Concepto: </span>
          {a.notes}
        </p>
      )}
      <div className="section-heading">
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          Movimientos del período {expanded ? '▴' : '▾'}
        </button>
        <button
          className="primary"
          disabled={
            closed || !a.id || a.amount_due === null || new Decimal(a.pending || 0).isZero()
          }
          onClick={() => setPayment({})}
        >
          Registrar pago
        </button>
      </div>
      {a.amount_due === null && (
        <small className="muted">Definí el importe a pagar para registrar pagos.</small>
      )}
      {expanded && (
        <>
          <ErrorBox error={q.error} />
          {a.id && q.isPending && <Loading />}
          {q.data?.map((p) => (
            <div className="payment-row" key={p.id}>
              <div>
                <b>{formatMoney(p.amount)}</b>
                <small>{formatDate(p.date)}</small>
                {p.notes && <small className="facilitator-notes">{p.notes}</small>}
              </div>
              <div className="actions">
                <button disabled={closed} onClick={() => setPayment(p)}>
                  Editar
                </button>
                <DeleteButton
                  disabled={closed}
                  path={`/facilitator-accounts/${a.id}/payments/${p.id}`}
                />
              </div>
            </div>
          ))}
          {(!a.id || (!q.isPending && !q.error && !q.data?.length)) && (
            <p className="muted">No hay pagos registrados.</p>
          )}
        </>
      )}
      {due && <AccountForm account={a} close={() => setDue(false)} />}
      {payment && (
        <PaymentForm
          account={a}
          payment={payment}
          close={() => {
            setPayment(undefined);
            setExpanded(true);
          }}
        />
      )}
    </article>
  );
}
function AccountForm({ account: a, close }: { account: FacilitatorAccount; close: () => void }) {
  const [amount, setAmount] = useState(a.amount_due ?? '');
  const [notes, setNotes] = useState(a.notes);
  const [error, setError] = useState('');
  const m = useSave('/facilitator-accounts', 'PUT', close);
  return (
    <Modal title="Importe a pagar / concepto" close={close}>
      <p>
        {a.instructor} · {a.activity}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const result = facilitatorAccountSchema.safeParse({
            offering_id: a.offering_id,
            instructor_id: a.instructor_id,
            amount_due: amount === '' ? null : amount,
            notes,
          });
          if (!result.success) {
            setError(result.error.issues.map((i) => i.message).join(' '));
            return;
          }
          setError('');
          m.mutate(result.data);
        }}
      >
        <Field label="A pagar (ARS)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <p className="muted">
          Vacío significa no definido. Cero define explícitamente que no hay importe a pagar.
        </p>
        <Field label="Observaciones / Concepto">
          <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
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
function PaymentForm({
  account: a,
  payment: p,
  close,
}: {
  account: FacilitatorAccount;
  payment: Partial<FacilitatorPayment>;
  close: () => void;
}) {
  const [data, setData] = useState({
    date:
      p.date ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Cordoba',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    amount: p.amount || '',
    notes: p.notes || '',
  });
  const [error, setError] = useState('');
  const m = useSave(
    `/facilitator-accounts/${a.id}/payments${p.id ? '/' + p.id : ''}`,
    p.id ? 'PUT' : 'POST',
    close,
  );
  return (
    <Modal title={p.id ? 'Editar pago' : 'Registrar pago'} close={close}>
      <p>
        {a.instructor} · {a.activity}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const result = facilitatorPaymentSchema.safeParse(data);
          if (!result.success) {
            setError(result.error.issues.map((i) => i.message).join(' '));
            return;
          }
          setError('');
          m.mutate(result.data);
        }}
      >
        <div className="form-grid">
          <Field label="Fecha">
            <input
              type="date"
              required
              value={data.date}
              onChange={(e) => setData({ ...data, date: e.target.value })}
            />
          </Field>
          <Field label="Importe (ARS)">
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={data.amount}
              onChange={(e) => setData({ ...data, amount: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Observación del movimiento">
          <textarea
            maxLength={2000}
            value={data.notes}
            onChange={(e) => setData({ ...data, notes: e.target.value })}
          />
        </Field>
        <p className="muted">
          La fecha puede pertenecer a otro mes; el pago corresponde a este período económico.
        </p>
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
