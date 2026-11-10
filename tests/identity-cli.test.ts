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
  revokeSessions: vi.fn(),
}));
vi.mock('node:readline/promises', () => ({
  createInterface: () => ({ question: mocks.question, close: mocks.close }),
}));
vi.mock('../server/binding-operations', () => ({ operatorBindings: () => mocks }));
vi.mock('../server/identity', () => ({ revokeIdentitySessions: mocks.revokeSessions }));
import { runIdentityCli } from '../server/identity-cli';
const inputDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const outputDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const previousDatabase = process.env.DB_NAME;
beforeEach(() => {
  vi.resetAllMocks();
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

const userId = '14b609bf-95b3-4aa1-8134-b06cc56b36e1';
it('revokes only the confirmed user, rechecks destination and safely permits repetition', async () => {
  mocks.question.mockResolvedValue(`CONFIRM prisma_test revoke-sessions ${userId}`);
  await runIdentityCli(['revoke-sessions', 'prisma_test', userId]);
  await runIdentityCli(['revoke-sessions', 'prisma_test', userId]);
  expect(mocks.revokeSessions.mock.calls).toEqual([
    [userId, null],
    [userId, null],
  ]);
  expect(mocks.preflight).toHaveBeenCalledTimes(4);
  expect(console.log).toHaveBeenCalledWith('Individual sessions revoked for the confirmed user.');
  expect(mocks.close).toHaveBeenCalledTimes(2);
});
it.each(['no', 'CONFIRM prisma_test revoke-sessions', `CONFIRM wrong revoke-sessions ${userId}`])(
  'refuses incomplete or incorrect recovery confirmation: %s',
  async (answer) => {
    mocks.question.mockResolvedValueOnce(answer);
    await expect(runIdentityCli(['revoke-sessions', 'prisma_test', userId])).rejects.toThrow(
      'Cancelled',
    );
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  },
);
it.each([[], ['invalid'], [userId, 'extra']])(
  'rejects invalid recovery arguments %j',
  async (...values) => {
    await expect(runIdentityCli(['revoke-sessions', 'prisma_test', ...values])).rejects.toThrow();
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
    expect(mocks.question).not.toHaveBeenCalled();
  },
);
it('refuses recovery without terminal authority or explicit matching destination', async () => {
  for (const args of [['revoke-sessions'], ['revoke-sessions', 'wrong', userId]]) {
    await expect(runIdentityCli(args)).rejects.toThrow();
  }
  Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
  await expect(runIdentityCli(['revoke-sessions', 'prisma_test', userId])).rejects.toThrow();
  expect(mocks.preflight).not.toHaveBeenCalled();
  expect(mocks.revokeSessions).not.toHaveBeenCalled();
});
it('does not revoke when the verified destination changes while awaiting confirmation', async () => {
  mocks.question.mockResolvedValueOnce(`CONFIRM prisma_test revoke-sessions ${userId}`);
  mocks.preflight
    .mockResolvedValueOnce({ database: 'prisma_test' })
    .mockRejectedValueOnce(Error('Wrong database'));
  await expect(runIdentityCli(['revoke-sessions', 'prisma_test', userId])).rejects.toThrow(
    'Wrong database',
  );
  expect(mocks.revokeSessions).not.toHaveBeenCalled();
});
it.each(['Identidad inexistente.', 'MySQL unavailable'])(
  'reports no recovery success after %s',
  async (message) => {
    mocks.question.mockResolvedValueOnce(`CONFIRM prisma_test revoke-sessions ${userId}`);
    mocks.revokeSessions.mockRejectedValueOnce(Error(message));
    await expect(runIdentityCli(['revoke-sessions', 'prisma_test', userId])).rejects.toThrow(
      message,
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalled();
  },
);
