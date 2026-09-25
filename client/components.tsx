import {
  useEffect,
  useRef,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, LoaderCircle, Search } from 'lucide-react';
import { api } from './api';
export function useDebounce<T>(value: T) {
  const [v, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), 200);
    return () => clearTimeout(t);
  }, [value]);
  return v;
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} aria-labelledby="dialog-title">
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon" aria-label="Cerrar" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  const fieldId = useId();
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<any>, {
            id: fieldId,
            'aria-invalid': !!error,
            'aria-describedby': error ? `${fieldId}-error` : undefined,
          })
        : children}
      {error && (
        <small id={`${fieldId}-error`} className="error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="search">
      <Search size={18} />
      <input
        aria-label="Buscar personas"
        placeholder="Buscar por nombre, ID, teléfono, DNI o email…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" /> Cargando…
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="error-box">
      {error instanceof Error ? error.message : 'No se pudieron cargar los datos.'}
    </div>
  ) : null;
}
export function useSave(path: string, method: string, done: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api(path, method, body),
    onSuccess: () => {
      void qc.invalidateQueries();
      window.dispatchEvent(new CustomEvent('toast', { detail: 'Cambios guardados.' }));
      done();
    },
  });
}
export function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button className="primary" disabled={pending} type="submit">
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  );
}
export function DeleteButton({
  path,
  label = 'Eliminar',
  onDone,
}: {
  path: string;
  label?: string;
  onDone?: () => void;
}) {
  const [ask, set] = useState(false);
  const m = useSave(path, 'DELETE', () => {
    set(false);
    onDone?.();
  });
  return (
    <>
      <button className="danger subtle" onClick={() => set(true)}>
        {label}
      </button>
      {ask && (
        <Modal title={`${label} registro`} close={() => set(false)}>
          <p>
            Confirmá esta acción.{' '}
            {label === 'Archivar'
              ? 'El historial se conservará.'
              : 'El registro se eliminará y los totales se recalcularán.'}
          </p>
          <ErrorBox error={m.error} />
          <div className="actions">
            <button onClick={() => set(false)}>Cancelar</button>
            <button className="danger" disabled={m.isPending} onClick={() => m.mutate(undefined)}>
              {m.isPending ? 'Procesando…' : `Sí, ${label.toLowerCase()}`}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
