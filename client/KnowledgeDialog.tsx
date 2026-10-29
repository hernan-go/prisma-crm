import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function KnowledgeDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) {
        const target =
          previous === document.body || previous.matches(':disabled')
            ? document.querySelector<HTMLElement>(
                'dialog[open] textarea, dialog[open] input, dialog[open] button:not(:disabled)',
              )
            : previous;
        target?.focus();
      }
    };
  }, []);
  return createPortal(
    <dialog
      className="knowledge-notice"
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>,
    document.body,
  );
}
