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
// Dismissible, non-modal disclosures shared by mobile navigation and section help.
export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const breakpoint = window.matchMedia('(max-width: 700px)');
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('focusin', focus);
    breakpoint.addEventListener('change', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', focus);
      breakpoint.removeEventListener('change', resize);
    };
  }, [open]);
  return { open, setOpen, root, trigger, id };
}

export function SectionHelp({ title, children }: { title: string; children: ReactNode }) {
  const { open, setOpen, root, trigger, id } = useDisclosure();
  return (
    <div className="section-help mobile-only" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="help-toggle"
        aria-label={`Ayuda de ${title}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <div id={id} className="help-panel" role="region" aria-label={`Ayuda de ${title}`}>
          {children}
        </div>
      )}
    </div>
  );
}

export function PageTitle({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <>
      <div className="page-title">
        <h1>{title}</h1>
        {description && <SectionHelp title={title}>{description}</SectionHelp>}
      </div>
      {description && <p className="page-description">{description}</p>}
    </>
  );
}

export function PageHeading({
  title,
  description,
  eyebrow = 'ADMINISTRACIÓN',
  className = '',
  children,
}: {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`page-heading ${children ? '' : 'page-heading-no-actions'} ${className}`}>
      <div className="page-heading-copy">
        <span className="eyebrow page-eyebrow">{eyebrow}</span>
        <PageTitle title={title} description={description} />
      </div>
      {children}
    </div>
  );
}

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
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const titleId = useId();
  const safeClose = () => (dirty ? setDiscard(true) : close());
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        safeClose();
      }}
      aria-labelledby={titleId}
      onInputCapture={() => setDirty(true)}
      onChangeCapture={() => setDirty(true)}
      onClickCapture={(e) => {
        const button = (e.target as HTMLElement).closest('button');
        if (!button) return;
        if (dirty && /^(Cancelar|Volver a revisar)$/.test(button.textContent?.trim() || '')) {
          e.preventDefault();
          e.stopPropagation();
          setDiscard(true);
        } else if (button.closest('form') && button.type === 'button') setDirty(true);
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon" aria-label="Cerrar" onClick={safeClose}>
          <X size={20} />
        </button>
      </div>
      {discard && (
        <div className="discard-confirm" role="alert">
          <p>Hay cambios sin guardar. ¿Querés descartarlos?</p>
          <div className="actions">
            <button onClick={() => setDiscard(false)}>Seguir editando</button>
            <button className="danger" onClick={close}>
              Descartar cambios
            </button>
          </div>
        </div>
      )}
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
  disabled = false,
  onDone,
  description,
}: {
  path: string;
  description?: ReactNode;
  label?: string;
  onDone?: () => void;
  disabled?: boolean;
}) {
  const [ask, set] = useState(false);
  const m = useSave(path, 'DELETE', () => {
    set(false);
    onDone?.();
  });
  return (
    <>
      <button disabled={disabled} className="danger subtle" onClick={() => set(true)}>
        {label}
      </button>
      {ask && (
        <Modal title={`${label} registro`} close={() => set(false)}>
          <p>
            {description || (
              <>
                Confirmá esta acción.{' '}
                {label === 'Archivar'
                  ? 'El historial se conservará.'
                  : 'El registro se eliminará y los totales se recalcularán.'}
              </>
            )}
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
