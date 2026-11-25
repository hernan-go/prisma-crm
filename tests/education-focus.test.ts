import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effect: undefined as any }));
vi.mock('react', () => ({
  useRef: (value: unknown) => {
    const i = h.cursor++;
    return (h.slots[i] ??= { current: value });
  },
  useState: () => {
    const i = h.cursor++;
    return [
      h.slots[i],
      (value: unknown) => {
        h.slots[i] = value;
      },
    ];
  },
  useLayoutEffect: (effect: () => void) => {
    h.effect = effect;
  },
}));
import { useEducationFocus } from '../client/education-focus';
class Target {
  isConnected = true;
  visible = true;
  disabled = false;
  hidden = false;
  tabIndex = 0;

  focus = vi.fn(() => {
    if (!this.disabled) (document as any).activeElement = this;
  });
  getClientRects() {
    return this.visible ? [{}] : [];
  }
  matches() {
    return this.disabled;
  }
  closest(selector: string) {
    return selector === 'button' ? this : this.hidden ? this : null;
  }
}
function render() {
  h.cursor = 0;
  return useEducationFocus();
}
function fixture() {
  const f = render(),
    root = new Target(),
    button = new Target();
  f.root.current = root as any;
  f.capture(button as any);
  return { f, root, button };
}
beforeEach(() => {
  h.slots = [];
  vi.stubGlobal('HTMLElement', Target);
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('getComputedStyle', () => ({ visibility: 'visible' }));
});
it('captures the submitter before asynchronous preparation loses focus', () => {
  const { f, button } = fixture();
  (document as any).activeElement = null;
  f.restore();
  render();
  h.effect();
  expect(document.activeElement).toBe(button);
});
it('restores an enabled cancel trigger without scrolling', () => {
  const { f, button } = fixture();
  f.restore();
  render();
  h.effect();
  expect(button.focus).toHaveBeenCalledWith({ preventScroll: true });
});
it.each(['disabled', 'removed', 'invisible', 'hidden'])(
  'uses the stable fallback for a %s trigger',
  (kind) => {
    const { f, root, button } = fixture();
    if (kind === 'disabled') button.disabled = true;
    if (kind === 'removed') button.isConnected = false;
    if (kind === 'invisible') button.visible = false;
    if (kind === 'hidden') button.hidden = true;
    f.restore();
    render();
    h.effect();
    expect(document.activeElement).toBe(root);
  },
);
it.each(['disabled', 'removed'])('focuses the success result with a %s trigger', (kind) => {
  const { f, button } = fixture();
  const result = new Target();
  f.result.current = result as any;
  if (kind === 'disabled') button.disabled = true;
  else button.isConnected = false;
  f.restore(true);
  render();
  h.effect();
  expect(document.activeElement).toBe(result);
  expect(result.tabIndex).toBe(-1);
});
it('does not restore focus during StrictMode setup/cleanup without an explicit close', () => {
  const { button } = fixture();
  expect(h.effect()).toBeUndefined();
  expect(h.effect()).toBeUndefined();
  expect(button.focus).not.toHaveBeenCalled();
});

it('keeps a digital result separate from a nested binding result', () => {
  const { f } = fixture();
  const binding = new Target(),
    digital = new Target();
  f.result.current = digital as any;
  f.restore(true);
  render();
  h.effect();
  expect(document.activeElement).toBe(digital);
  expect(binding.focus).not.toHaveBeenCalled();
});
it('does not replace the operation trigger when another button is clicked during preparation', () => {
  const { f, button } = fixture();
  const other = new Target();
  other.focus();
  f.restore();
  render();
  h.effect();
  expect(document.activeElement).toBe(button);
});
