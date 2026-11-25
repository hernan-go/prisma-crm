import { useLayoutEffect, useRef, useState } from 'react';

export function focusEducationTarget(target: HTMLElement | null): boolean {
  if (
    !target?.isConnected ||
    !target.getClientRects().length ||
    target.matches(':disabled, [aria-disabled="true"]') ||
    target.closest('[hidden], [inert]') ||
    getComputedStyle(target).visibility !== 'visible'
  )
    return false;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

export function useEducationFocus() {
  const root = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const result = useRef<HTMLDivElement | HTMLParagraphElement | null>(null);
  const [request, setRequest] = useState<{ success: boolean }>();
  const capture = (element: HTMLElement | null) => {
    opener.current = element;
  };
  useLayoutEffect(() => {
    if (!request) return;
    // Runs after the parent commits its result, never during effect cleanup.
    if (request.success && result.current) {
      result.current.tabIndex = -1;
      if (focusEducationTarget(result.current)) return;
    }
    if (!request.success && focusEducationTarget(opener.current)) return;
    focusEducationTarget(root.current);
  }, [request]);
  return { root, result, capture, restore: (success = false) => setRequest({ success }) };
}
