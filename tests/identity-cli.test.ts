import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { pool } from '../server/db';
const mocks = vi.hoisted(() => ({
  question: vi.fn(),
  close: vi.fn(),
  preflight: vi.fn(),
  prepare: vi.fn(),
  inspect: vi.fn(),
  approve: vi.fn(),
  issue: vi.fn(),
}));
vi.mock('node:readline/promises', () => ({
  createInterface: () => ({ question: mocks.question, close: mocks.close }),
}));
vi.mock('../server/binding-operations', () => ({ operatorBindings: () => mocks }));
import { runIdentityCli } from '../server/identity-cli';
const inputDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const outputDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const previousDatabase = process.env.DB_NAME;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preflight.mockResolvedValue({ database: 'prisma_test' });
  process.env.DB_NAME = 'prisma_test';
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  if (inputDescriptor) Object.defineProperty(process.stdin, 'isTTY', inputDescriptor);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (outputDescriptor) Object.defineProperty(process.stdout, 'isTTY', outputDescriptor);
  else Reflect.deleteProperty(process.stdout, 'isTTY');
  if (previousDatabase === undefined) delete process.env.DB_NAME;
  else process.env.DB_NAME = previousDatabase;
});
afterAll(() => pool.end());
it('refuses noninteractive execution or mismatching explicit destination before any action', async () => {
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
  await expect(runIdentityCli(['prepare', 'prisma_test'])).rejects.toThrow();
  expect(mocks.prepare).not.toHaveBeenCalled();
  Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
  await expect(runIdentityCli(['prepare', 'wrong'])).rejects.toThrow();
  expect(mocks.preflight).not.toHaveBeenCalled();
});
it('requires an exact destination/action confirmation before creating UUIDs and configuring bootstrap', async () => {
  mocks.question.mockResolvedValueOnce('no');
  await expect(runIdentityCli(['prepare', 'prisma_test'])).rejects.toThrow('Cancelled');
  expect(mocks.prepare).not.toHaveBeenCalled();
  mocks.question.mockResolvedValueOnce('CONFIRM prisma_test prepare');
  await runIdentityCli(['prepare', 'prisma_test']);
  const ids = mocks.prepare.mock.calls[0][0];
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
});
it('requires independent matching receipt and confirmation for the exact inspected candidate', async () => {
  mocks.inspect.mockResolvedValue({ fingerprint: 'a'.repeat(64) });
  mocks.question.mockResolvedValueOnce('b'.repeat(64));
  await expect(runIdentityCli(['approve', 'prisma_test', 'operation', 'user'])).rejects.toThrow(
    'mismatch',
  );
  expect(mocks.approve).not.toHaveBeenCalled();
  mocks.question
    .mockResolvedValueOnce('a'.repeat(64))
    .mockResolvedValueOnce('CONFIRM prisma_test approve');
  await runIdentityCli(['approve', 'prisma_test', 'operation', 'user']);
  expect(mocks.approve).toHaveBeenCalledWith('operation', 'user', 'a'.repeat(64));
});
it('never issues an authorization after preflight failure', async () => {
  mocks.preflight.mockRejectedValueOnce(Error('Unavailable destination/schema'));
  await expect(runIdentityCli(['issue', 'prisma_test', 'uuid', 'initial'])).rejects.toThrow();
  expect(mocks.issue).not.toHaveBeenCalled();
});
