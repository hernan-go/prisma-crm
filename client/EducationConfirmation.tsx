import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { Field, Modal, ErrorBox } from './components';
const root = '/education-access';
export function AccessConfirmation({
  title,
  command,
  close,
  done,
  children,
  canConfirm = true,
}: {
  title: string;
  command: Record<string, unknown>;
  close: () => void;
  done: (r: any) => void;
  children: React.ReactNode;
  canConfirm?: boolean;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, unknown>>();
  const [error, setError] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      feedback.current?.focus({ preventScroll: true });
      feedback.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [error]);
  async function submit(recover = false) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    const input = submitted ?? {
      ...command,
      operationId,
      ...(command.kind !== 'digital' ? { reason: reason.trim() } : {}),
    };
    setSubmitted(input);
    try {
      if (recover) {
        const receipt = await api<{ result: any }>(`${root}/operations/${operationId}`);
        done(receipt.result);
      } else done(await api(`${root}/operations`, 'POST', input));
    } catch (e) {
      setError(e as Error);
      setUncertain(recover ? true : !(e instanceof ApiError) || e.status >= 500);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Modal
      title={title}
      close={() => {
        if (!busy.current && !uncertain) close();
      }}
      dirtyOverride={false}
    >
      {children}
      {command.kind !== 'digital' && (
        <Field
          label={
            command.kind === 'revoke'
              ? 'Motivo de revocación'
              : 'Motivo administrativo de la operación'
          }
        >
          <textarea
            required
            maxLength={500}
            disabled={!!submitted}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      )}
      <p>Operación: {operationId}</p>
      {error && (
        <div ref={feedback} tabIndex={-1} aria-label="Resultado de la operación">
          <ErrorBox error={error} />
        </div>
      )}
      {uncertain && (
        <p role="alert">
          Resultado incierto. Conservá esta ventana y consultá el recibo o reintentá la misma
          operación. No prepares otra operación. Si recargás la página, buscá este identificador en
          el historial antes de actuar.
        </p>
      )}
      {error && !uncertain && (
        <p>
          La solicitud fue rechazada. Cerrá esta confirmación, actualizá el estado y revisá
          nuevamente.
        </p>
      )}
      <div className="actions">
        <button disabled={pending || uncertain} onClick={close}>
          Cancelar
        </button>
        {uncertain && (
          <button disabled={pending} onClick={() => void submit(true)}>
            Consultar recibo
          </button>
        )}
        <button
          className="primary"
          disabled={
            pending ||
            (!submitted && !canConfirm) ||
            (!uncertain && !!error) ||
            (command.kind !== 'digital' && !reason.trim())
          }
          onClick={() => void submit()}
        >
          {pending
            ? 'Procesando…'
            : uncertain
              ? 'Reintentar misma operación'
              : 'Confirmar operación'}
        </button>
      </div>
    </Modal>
  );
}
