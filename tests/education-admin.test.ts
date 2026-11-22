import { beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), peopleTransaction: vi.fn() }));
vi.mock('../server/db', () => ({ ...db, pool: { end: vi.fn() } }));
import { educationAdmin, readEducation, previewDigital } from '../server/education-admin';
import { createApp } from '../server/app';
import * as identity from '../server/identity';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  op = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token = 'a'.repeat(64),
  now = Date.parse('2026-11-22T12:00:00-03:00');
const app = () =>
  createApp(
    {
      identityEnabled: true,
      hash: `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`,
      secret: 's'.repeat(64),
    },
    {},
    {},
    false,
    false,
  );
let authorized = true;
const person = { id: 1, public_id: 'QA-1', nombre: 'Synthetic', apellido: 'Learner', activo: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  authorized = true;
  vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue({
    id: actor,
    display_name: 'QA',
    status: 'enabled',
    roles: ['admin'],
    expiresAt: now + 3600000,
  });
  db.peopleTransaction.mockImplementation((fn) => fn({}));
  db.execute.mockResolvedValue({ affectedRows: 1 });
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT revision')) return [{ revision: 4 }];
    if (sql.includes('SELECT s.user_id')) return authorized ? [{ user_id: actor }] : [];
    if (sql.includes('now_ms')) return [{ now_ms: now }];
    if (sql.includes('FROM people WHERE id=')) return [person];
    if (sql.includes('FROM activities ORDER'))
      return [{ id: 2, name: 'Inclusión Digital', active: 1 }];
    if (sql.includes('FROM education_digital_rights d'))
      return [
        {
          id: op,
          activity_id: 2,
          activity: 'Inclusión Digital',
          starts_at: now - 1,
          ends_at: now + 100000,
          revoked_at: null,
        },
      ];
    if (sql.includes('SELECT MAX')) return [{ last_end: 0 }];
    if (sql.includes('SELECT id FROM people') || sql.includes('SELECT id FROM activities'))
      return [{ id: 1 }];
    if (sql.includes('SELECT id,revoked_at FROM education_digital_rights WHERE id='))
      return [{ id: op, revoked_at: null }];
    return [];
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.restoreAllMocks());
const paths = ['/people?q=QA', '/people/1', '/people/1/history', '/operations/' + op];
it.each(paths)('authorizes administrative read %s', async (path) => {
  const response = await request(app())
    .get('/api/education-access' + path)
    .set('Cookie', `prisma_identity=${token}`);
  expect(response.status).toBe(path.includes('/operations/') ? 404 : 200);
  expect(db.query.mock.calls.some((c) => String(c[0]).includes('SELECT s.user_id'))).toBe(true);
});
it.each(['facilitator', 'participant'] as const)(
  'denies %s for all administrative endpoints',
  async (role) => {
    vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue({
      id: actor,
      display_name: 'QA',
      status: 'enabled',
      roles: [role],
      expiresAt: now + 1,
    });
    for (const path of paths)
      expect(
        (
          await request(app())
            .get('/api/education-access' + path)
            .set('Cookie', `prisma_identity=${token}`)
        ).status,
      ).toBe(403);
    for (const path of ['/preview', '/operations'])
      expect(
        (
          await request(app())
            .post('/api/education-access' + path)
            .set('Cookie', `prisma_identity=${token}`)
            .send({})
        ).status,
      ).toBe(403);
    expect(db.peopleTransaction).not.toHaveBeenCalled();
  },
);
it.each(['missing', 'expired', 'revoked'])('rejects %s session', async (kind) => {
  vi.spyOn(identity, 'authenticateIdentitySession').mockResolvedValue(undefined);
  expect(
    (
      await request(app())
        .get('/api/education-access/people/1')
        .set('Cookie', kind === 'missing' ? '' : `prisma_identity=${token}`)
    ).status,
  ).toBe(401);
  expect(db.peopleTransaction).not.toHaveBeenCalled();
});
it('revalidates institutional Google authority for reads', async () => {
  authorized = false;
  await expect(readEducation(token, { kind: 'person', personId: 1 })).rejects.toThrow(
    'administrativa',
  );
  expect(db.query.mock.calls.some((c) => String(c[0]).includes('FROM people'))).toBe(false);
});
it('denies legacy authority before accessing educational data', async () => {
  const instance = express();
  instance.use((_req, res, next) => {
    res.locals.principal = { kind: 'legacy' };
    next();
  });
  instance.use('/education-access', educationAdmin);
  instance.use(
    (error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(error.status ?? 500).json({ message: error.message }),
  );
  expect((await request(instance).get('/education-access/people?q=QA')).status).toBe(403);
  expect(db.peopleTransaction).not.toHaveBeenCalled();
});
it('rejects missing person and catalog references without writes', async () => {
  const query = db.query.getMockImplementation()!;
  db.query.mockImplementation((sql: string, ...args: any[]) =>
    sql.includes('FROM people WHERE id=') ? [] : query(sql, ...args),
  );
  await expect(previewDigital(token, { personId: 999, activityId: 2 })).rejects.toThrow(
    'Persona inexistente',
  );
  db.query.mockImplementation(query);
  await expect(previewDigital(token, { personId: 1, activityId: 999 })).rejects.toThrow(
    'Actividad inexistente',
  );
  expect(db.execute).not.toHaveBeenCalled();
});
it('previews renewal from remaining end, with fixed commercial dates', async () => {
  const p = await previewDigital(token, { personId: 1, activityId: 2 });
  expect(p.previousEnd).toBe(now + 100000);
  expect(p.startsAt).toBe(now + 100000);
  expect(p.expectedWindow).toEqual({ startDate: '2026-11-22', endDate: '2027-02-22' });
  expect(db.execute).not.toHaveBeenCalled();
});
it('projects a safe receipt without private session digest or original command', async () => {
  db.query.mockImplementation(async (sql: string) =>
    sql.includes('SELECT s.user_id')
      ? [{ user_id: actor }]
      : sql.includes('SELECT revision')
        ? [{ revision: 4 }]
        : sql.includes('education_operations o')
          ? [
              {
                operation_id: op,
                actor_id: actor,
                actor_name: 'QA',
                created_at: now,
                request_json: {
                  session: 'PRIVATE_DIGEST',
                  input: {
                    kind: 'digital',
                    reason: 'QA',
                    personId: 1,
                    activityId: 2,
                    paymentVerified: true,
                    verificationReference: 'ref',
                  },
                },
                result_json: { revision: 4 },
              },
            ]
          : [],
  );
  const result = await readEducation(token, { kind: 'receipt', operationId: op });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_DIGEST');
  expect(result).toMatchObject({ actorId: actor, paymentDeclared: true, accountedPayment: false });
});
it('validates IDs and disallows link/presential writes through this module', async () => {
  expect(
    (
      await request(app())
        .get('/api/education-access/people/no')
        .set('Cookie', `prisma_identity=${token}`)
    ).status,
  ).toBe(422);
  const body = {
    kind: 'presential',
    operationId: op,
    expectedRevision: 4,
    personId: 1,
    activityId: 2,
    enabled: true,
    reason: 'QA',
  };
  expect(
    (
      await request(app())
        .post('/api/education-access/operations')
        .set('Cookie', `prisma_identity=${token}`)
        .send(body)
    ).status,
  ).toBe(422);
  expect(db.execute).not.toHaveBeenCalled();
});
it('rejects cross-site writes and unverified payments', async () => {
  const body = {
    kind: 'digital',
    operationId: op,
    expectedRevision: 4,
    personId: 1,
    activityId: 2,
    paymentVerified: false,
    verificationReference: 'QA',
    reason: 'QA',
  };
  expect(
    (
      await request(app())
        .post('/api/education-access/operations')
        .set('Cookie', `prisma_identity=${token}`)
        .set('Origin', 'https://external.invalid')
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app())
        .post('/api/education-access/operations')
        .set('Cookie', `prisma_identity=${token}`)
        .send(body)
    ).status,
  ).toBe(422);
  expect(db.execute).not.toHaveBeenCalled();
});
it('confirms grant/renewal and revoke using the existing service and session-derived actor', async () => {
  for (const body of [
    {
      kind: 'digital',
      operationId: op,
      expectedRevision: 4,
      personId: 1,
      activityId: 2,
      paymentVerified: true,
      verificationReference: 'QA',
      reason: 'QA',
      expectedWindow: { startDate: '2026-11-22', endDate: '2027-02-22' },
    },
    { kind: 'revoke', operationId: op, expectedRevision: 4, rightId: op, reason: 'QA' },
  ]) {
    const response = await request(app())
      .post('/api/education-access/operations')
      .set('Cookie', `prisma_identity=${token}`)
      .send(body);
    expect(response.status).toBe(200);
  }
  const audit = db.execute.mock.calls.find((c) =>
    String(c[0]).includes('INSERT INTO education_operations'),
  )!;
  expect(audit[1][1]).toBe(actor);
});
it('rejects a changed commercial date before granting', async () => {
  const body = {
    kind: 'digital',
    operationId: op,
    expectedRevision: 4,
    personId: 1,
    activityId: 2,
    paymentVerified: true,
    verificationReference: 'QA',
    reason: 'QA',
    expectedWindow: { startDate: '2026-11-21', endDate: '2027-02-21' },
  };
  const response = await request(app())
    .post('/api/education-access/operations')
    .set('Cookie', `prisma_identity=${token}`)
    .send(body);
  expect(response.status).toBe(409);
  expect(db.execute).not.toHaveBeenCalled();
});
