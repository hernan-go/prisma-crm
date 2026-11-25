import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as any[], api: vi.fn() }));
vi.mock('react', async (original) => ({
  ...(await original<object>()),
  useState: (initial: any) => {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      h.slots[i],
      (value: any) => {
        h.slots[i] = value;
      },
    ];
  },
  useRef: (value: any) => {
    const i = h.cursor++;
    return (h.slots[i] ??= { current: value });
  },
  useEffect: (effect: any) => {
    h.effects.push(effect);
  },
}));
vi.mock('../client/api', async (original) => ({ ...(await original<object>()), api: h.api }));
import { AccessConfirmation } from '../client/EducationConfirmation';
import { ApiError } from '../client/api';
const close = vi.fn(),
  done = vi.fn();
function render() {
  h.cursor = 0;
  h.effects = [];
  return AccessConfirmation({
    title: 'QA',
    command: { kind: 'digital' },
    close,
    done,
    children: null,
  });
}
function elements(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)];
}
beforeEach(() => {
  h.slots = [];
  vi.clearAllMocks();
});
it('blocks modal dismissal while pending and after an uncertain response', async () => {
  let reject!: (error: Error) => void;
  h.api.mockImplementation(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  let tree = render();
  const submit = elements(tree).find((n) => n.type === 'button' && n.props.className === 'primary');
  const pending = submit.props.onClick();
  tree.props.close();
  expect(close).not.toHaveBeenCalled();
  reject(new Error('Synthetic unavailable'));
  await pending;
  await Promise.resolve();
  tree = render();
  tree.props.close();
  expect(close).not.toHaveBeenCalled();
  expect(
    elements(tree).find((n) => n.type === 'button' && n.props.children === 'Cancelar').props
      .disabled,
  ).toBe(true);
  expect(done).not.toHaveBeenCalled();
});
it('focuses rejected feedback while preserving explicit dismissal', async () => {
  h.api.mockRejectedValue(new ApiError('Synthetic rejection', 409));
  let tree = render();
  elements(tree)
    .find((n) => n.type === 'button' && n.props.className === 'primary')
    .props.onClick();
  await Promise.resolve();
  await Promise.resolve();
  tree = render();
  const region = elements(tree).find((n) => n.props['aria-label'] === 'Resultado de la operación');
  expect(region).toBeDefined();
  const focus = vi.fn(),
    scrollIntoView = vi.fn();
  region.props.ref.current = { focus, scrollIntoView };
  for (const effect of h.effects) effect();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  tree.props.close();
  expect(close).toHaveBeenCalledTimes(1);
});
