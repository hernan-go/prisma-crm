import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), peopleTransaction: vi.fn() }));
vi.mock('../server/db', () => db);
import {
  quarterEnd,
  hasEducationalAccess,
  educationCommand,
  mutateEducation,
  educationalEntitlement,
} from '../server/education-access';
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const op = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const command = {
  kind: 'digital',
  operationId: op,
  expectedRevision: 0,
  reason: 'Confirmed privately',
  personId: 1,
  activityId: 2,
  verificationReference: 'receipt-1',
  paymentVerified: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  db.peopleTransaction.mockImplementation((fn) => fn({}));
  db.execute.mockResolvedValue({ affectedRows: 1 });
});
describe('calendar quarter UTC-03', () => {
  it.each([
    ['2026-11-30T12:34:56.789-03:00', '2027-02-28T12:34:56.789-03:00'],
    ['2027-11-30T12:00:00-03:00', '2028-02-29T12:00:00-03:00'],
    ['2026-01-31T23:59:59-03:00', '2026-04-30T23:59:59-03:00'],
    ['2026-02-28T00:00:00-03:00', '2026-05-28T00:00:00-03:00'],
  ])('%s → %s', (a, b) => expect(quarterEnd(Date.parse(a))).toBe(Date.parse(b)));
});
describe('independent entitlements', () => {
  const digital = { starts_at: 100, ends_at: 200, revoked: false };
  it.each([
    [false, [], false],
    [true, [], true],
    [false, [digital], true],
    [true, [digital], true],
    [false, [{ ...digital, revoked: true }], false],
    [true, [{ ...digital, revoked: true }], true],
  ])('OR policy', (p, r, want) =>
    expect(hasEducationalAccess(p as boolean, r as (typeof digital)[], 150)).toBe(want),
  );
  it('start inclusive, expiry exclusive; Yoga survives Inclusion expiry', () => {
    expect(hasEducationalAccess(false, [digital], 99)).toBe(false);
    expect(hasEducationalAccess(false, [digital], 100)).toBe(true);
    expect(hasEducationalAccess(false, [digital], 200)).toBe(false);
    expect(hasEducationalAccess(true, [], 200)).toBe(true);
  });
  it('rejects unverified payments and extra fields', () => {
    expect(educationCommand.safeParse({ ...command, paymentVerified: false }).success).toBe(false);
    expect(educationCommand.safeParse({ ...command, admin: true }).success).toBe(false);
  });
});
function fixture(lastEnd = 0, authorized = true) {
  const writes: unknown[][] = [];
  db.execute.mockImplementation((...args) => {
    writes.push(args);
    return { affectedRows: 1 };
  });
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('identity_institution WHERE')) return [{ id: 1 }];
    if (sql.includes('SELECT revision')) return [{ revision: 0 }];
    if (sql.includes('SELECT s.user_id')) return authorized ? [{ user_id: user }] : [];
    if (sql.includes('education_operations')) return [];
    if (sql.includes('now_ms')) return [{ now_ms: Date.parse('2026-11-22T12:00:00-03:00') }];
    if (sql.includes('SELECT MAX')) return [{ last_end: lastEnd }];
    if (sql.includes('verification_reference')) return [];
    return [{ id: 1 }];
  });
  return writes;
}
it('rejects absent administrative authorization before writes', async () => {
  const writes = fixture(0, false);
  await expect(mutateEducation('a'.repeat(64), command)).rejects.toThrow('administrativa');
  expect(writes).toHaveLength(0);
});
it.each([0, Date.parse('2027-01-31T12:00:00-03:00')])(
  'renewal uses max(now,last end)',
  async (last) => {
    fixture(last);
    const r = await mutateEducation('a'.repeat(64), command);
    expect(r.startsAt).toBe(Math.max(last, Date.parse('2026-11-22T12:00:00-03:00')));
    expect(r.endsAt).toBe(quarterEnd(r.startsAt));
  },
);
it('rejects stale revision without mutation', async () => {
  const writes = fixture();
  await expect(
    mutateEducation('a'.repeat(64), { ...command, expectedRevision: 2 }),
  ).rejects.toThrow('obsoleta');
  expect(writes).toHaveLength(0);
});
it('replay returns persisted result without another grant', async () => {
  const writes = fixture();
  const r = await mutateEducation('a'.repeat(64), command);
  const audit = writes.find((w) => String(w[0]).includes('INSERT INTO education_operations'))!;
  const values = audit[1] as string[];
  db.query.mockImplementation(async (sql: string) =>
    sql.includes('SELECT revision')
      ? [{ revision: 1 }]
      : sql.includes('SELECT s.user_id')
        ? [{ user_id: user }]
        : sql.includes('education_operations')
          ? [{ request_json: JSON.parse(values[2]), result_json: JSON.parse(values[3]) }]
          : [{ id: 1 }],
  );
  writes.length = 0;
  expect(await mutateEducation('a'.repeat(64), command)).toEqual(r);
  expect(writes).toHaveLength(0);
});
it('unlinked identity has no entitlement', async () => {
  fixture();
  db.query.mockImplementation(async (sql: string) =>
    sql.includes('SELECT revision') ? [{ revision: 0 }] : [],
  );
  expect(await educationalEntitlement(user, 2)).toBe(false);
});
