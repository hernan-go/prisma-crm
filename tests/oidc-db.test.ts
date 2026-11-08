import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as db from '../server/db';
import { migrate } from '../server/migrate';
import { createGoogleOidc } from '../server/google-oidc';
import { digest, opaque } from '../server/oidc-crypto';
import { mysqlOidcStore, type OidcContext } from '../server/oidc-store';
import { options, simulatedGoogle } from './oidc-helper';

const ids: string[] = [];
const users: string[] = [];
const operations: string[] = [];
const sessions: string[] = [];
let safe = false;
const store = mysqlOidcStore();
const timeSQL = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';
async function start(context: OidcContext = { purpose: 'login' }) {
  const google = simulatedGoogle(),
    core = createGoogleOidc(options, store, google.transport);
  const attempt = await core.begin(context);
  ids.push(attempt.attemptId);
  const ref = core.evidenceReference(attempt.attemptId, attempt.browserToken, context);
  const callback = google.use(attempt.authorizationUrl);
  return { google, core, attempt, ref, callback, context };
}
async function row(id: string) {
  return (await db.query('SELECT * FROM identity_oidc_attempts WHERE id=?', [id]))[0];
}
async function verified(context: OidcContext = { purpose: 'login' }) {
  const a = await start(context);
  await a.core.complete(a.callback, a.attempt.browserToken, context);
  return a;
}
async function binding() {
  const id = randomUUID(),
    op = randomUUID();
  await db.execute(
    "INSERT INTO identity_users(id,display_name) VALUES (?,'Synthetic OIDC fixture')",
    [id],
  );
  users.push(id);
  await db.execute(
    `INSERT INTO identity_binding_operations(id,user_id,purpose,code_hash,created_at,expires_at)
    VALUES (?,?,'initial',?,${timeSQL},${timeSQL}+600000)`,
    [op, id, digest(opaque())],
  );
  operations.push(op);
  return { purpose: 'binding' as const, userId: id, operationId: op };
}
async function reauth() {
  const id = randomUUID(),
    sessionHash = digest(opaque());
  await db.execute(
    "INSERT INTO identity_users(id,display_name) VALUES (?,'Synthetic OIDC reauth fixture')",
    [id],
  );
  users.push(id);
  await db.execute(
    "INSERT INTO identity_external_accounts(provider,subject,user_id) VALUES ('google',?,?)",
    ['synthetic-google-sub-' + id, id],
  );
  await db.execute(
    `INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at)
    VALUES (?,?,'crm',${timeSQL},${timeSQL}+600000)`,
    [sessionHash, id],
  );
  sessions.push(sessionHash);
  return { purpose: 'reauth' as const, userId: id, sessionHash };
}
async function counts() {
  const result: Record<string, number> = {};
  for (const table of [
    'identity_users',
    'identity_user_roles',
    'identity_external_accounts',
    'identity_sessions',
    'admin_sessions',
    'identity_binding_operations',
    'identity_audit_events',
  ])
    result[table] = Number((await db.query(`SELECT COUNT(*) n FROM ${table}`))[0].n);
  return result;
}
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (safe) {
    // Delete ONLY exact fixture IDs owned by this suite, never reset shared state.
    for (const id of ids) await db.execute('DELETE FROM identity_oidc_attempts WHERE id=?', [id]);
    for (const id of sessions)
      await db.execute('DELETE FROM identity_sessions WHERE token_hash=?', [id]);
    for (const id of operations)
      await db.execute('DELETE FROM identity_binding_operations WHERE id=?', [id]);
    for (const id of users) {
      await db.execute('DELETE FROM identity_external_accounts WHERE user_id=?', [id]);
      await db.execute('DELETE FROM identity_users WHERE id=?', [id]);
    }
  }
  await db.pool.end();
});
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('OIDC MySQL prisma_test, isolated', () => {
  beforeAll(async () => {
    expect(process.env.DB_NAME).toBe('prisma_test');
    expect(['127.0.0.1', 'localhost', '::1']).toContain(process.env.DB_HOST || '127.0.0.1');
    expect((await db.query('SELECT DATABASE() name'))[0].name).toBe('prisma_test');
    await migrate('018.sql');
    const names = [
      'identity_users',
      'identity_external_accounts',
      'identity_user_roles',
      'identity_sessions',
      'identity_audit_events',
      'identity_institution',
      'identity_binding_operations',
      'admin_sessions',
    ];
    const definitions = await Promise.all(names.map((n) => db.query('SHOW CREATE TABLE ' + n)));
    const before = await counts();
    await migrate('019.sql');
    safe = true;
    await migrate('019.sql');
    expect(await counts()).toEqual(before);
    for (let i = 0; i < names.length; i++)
      expect(await db.query('SHOW CREATE TABLE ' + names[i])).toEqual(definitions[i]);
  });
  it('persists encrypted PKCE for exactly five minutes; new instance survives restart before claim', async () => {
    const a = await start();
    const pending = await row(a.attempt.attemptId);
    expect(Number(pending.expires_at) - Number(pending.created_at)).toBe(300000);
    expect(pending.pkce_encrypted).toHaveLength(95);
    expect(pending.state_hash).toBe(
      digest(new URL(a.attempt.authorizationUrl).searchParams.get('state')!),
    );
    expect(pending.browser_hash).toBe(digest(a.attempt.browserToken));
    const before = await counts();
    const restarted = createGoogleOidc(options, mysqlOidcStore(), a.google.transport);
    await restarted.complete(a.callback, a.attempt.browserToken, { purpose: 'login' });
    const proof = await row(a.attempt.attemptId);
    expect(proof.status).toBe('verified');
    expect(proof.pkce_encrypted).toBeNull();
    expect(proof.nonce).toBeNull();
    expect(await counts()).toEqual(before);
    const evidence = await db.transaction((connection) => store.consumeEvidence(connection, a.ref));
    expect(evidence.subject).toBe('synthetic-google-sub');
    expect((await row(a.attempt.attemptId)).subject).toBeNull();
    await expect(db.transaction((c) => store.consumeEvidence(c, a.ref))).rejects.toThrow();
  });
  it('commits claim and erases sensitive material before network; two callbacks have one winner', async () => {
    const a = await start();
    const callback = a.google.use(a.attempt.authorizationUrl, {
      beforeToken: async () => {
        const claimed = await row(a.attempt.attemptId);
        expect(claimed.status).toBe('claimed');
        expect(claimed.pkce_encrypted).toBeNull();
        // Another connection can lock/update the row while transport is running.
        await db.transaction(async (c) => {
          await db.query(
            'SELECT id FROM identity_oidc_attempts WHERE id=? FOR UPDATE',
            [a.attempt.attemptId],
            c,
          );
        });
      },
    });
    const results = await Promise.allSettled([
      a.core.complete(callback, a.attempt.browserToken, a.context),
      createGoogleOidc(options, mysqlOidcStore(), a.google.transport).complete(
        callback,
        a.attempt.browserToken,
        a.context,
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(a.google.calls).toBe(1);
    await expect(a.core.complete(callback, a.attempt.browserToken, a.context)).rejects.toThrow();
  });
  it('rejects wrong browser, state, purpose and configuration without claiming', async () => {
    const a = await start();
    await expect(a.core.complete(a.callback, opaque(), a.context)).rejects.toThrow();
    const wrong = new URL(a.callback);
    wrong.searchParams.set('state', opaque());
    await expect(a.core.complete(wrong.href, a.attempt.browserToken, a.context)).rejects.toThrow();
    await expect(
      createGoogleOidc(
        { ...options, clientId: 'other.apps.googleusercontent.com' },
        store,
        a.google.transport,
      ).complete(a.callback, a.attempt.browserToken, a.context),
    ).rejects.toThrow();
    const c = await binding();
    await expect(a.core.complete(a.callback, a.attempt.browserToken, c)).rejects.toThrow();
    expect((await row(a.attempt.attemptId)).status).toBe('pending');
    expect(a.google.calls).toBe(0);
  });
  it('database expiration, including expiry during external exchange, prevents verification', async () => {
    const a = await start();
    await db.execute(
      `UPDATE identity_oidc_attempts SET created_at=${timeSQL}-300001,expires_at=${timeSQL}-1 WHERE id=?`,
      [a.attempt.attemptId],
    );
    await expect(a.core.complete(a.callback, a.attempt.browserToken, a.context)).rejects.toThrow();
    expect(a.google.calls).toBe(0);
    const b = await start();
    const callback = b.google.use(b.attempt.authorizationUrl, {
      beforeToken: async () => {
        await db.execute(`UPDATE identity_oidc_attempts SET expires_at=${timeSQL}-1 WHERE id=?`, [
          b.attempt.attemptId,
        ]);
      },
    });
    await expect(b.core.complete(callback, b.attempt.browserToken, b.context)).rejects.toThrow();
    expect((await row(b.attempt.attemptId)).status).toBe('invalidated');
  });
  it('a crash after committed claim cannot be resumed by a new instance', async () => {
    const a = await start();
    await store.claim(digest(new URL(a.callback).searchParams.get('state')!), a.ref);
    expect((await row(a.attempt.attemptId)).pkce_encrypted).toBeNull();
    const restarted = createGoogleOidc(options, mysqlOidcStore(), a.google.transport);
    await expect(
      restarted.complete(a.callback, a.attempt.browserToken, a.context),
    ).rejects.toThrow();
    expect(a.google.calls).toBe(0);
  });
  it('provider/decryption failure burns the attempt and never exposes sensitive driver errors', async () => {
    for (const kind of ['provider', 'corruption', 'missing-key']) {
      const a = await start();
      if (kind === 'corruption')
        await db.execute('UPDATE identity_oidc_attempts SET pkce_encrypted=? WHERE id=?', [
          'a'.repeat(95),
          a.attempt.attemptId,
        ]);
      const core =
        kind === 'missing-key'
          ? createGoogleOidc(
              { ...options, activeKeyId: 'v2', keys: { v2: 'cd'.repeat(32) } },
              store,
              a.google.transport,
            )
          : a.core;
      const callback = a.google.use(a.attempt.authorizationUrl, { fail: kind === 'provider' });
      await expect(core.complete(callback, a.attempt.browserToken, a.context)).rejects.toThrow(
        /^OIDC operation unavailable\.$/,
      );
      expect((await row(a.attempt.attemptId)).status).toBe('invalidated');
      expect((await row(a.attempt.attemptId)).pkce_encrypted).toBeNull();
    }
    const a = await start();
    vi.spyOn(db, 'execute').mockRejectedValueOnce(
      new Error('driver SQL with confidential verifier'),
    );
    await expect(a.core.complete(a.callback, a.attempt.browserToken, a.context)).rejects.toThrow(
      /^OIDC operation unavailable\.$/,
    );
    expect((await row(a.attempt.attemptId)).status).toBe('pending');
  });
  it('binding context caps evidence lifetime and rejects crossed UUID, operation and revocation', async () => {
    const c = await binding();
    await db.execute(
      `UPDATE identity_binding_operations SET expires_at=${timeSQL}+120000 WHERE id=?`,
      [c.operationId],
    );
    const a = await start(c);
    const operation = (
      await db.query('SELECT expires_at FROM identity_binding_operations WHERE id=?', [
        c.operationId,
      ])
    )[0];
    expect(Number((await row(a.attempt.attemptId)).expires_at)).toBe(Number(operation.expires_at));
    const other = await binding();
    await expect(
      a.core.complete(a.callback, a.attempt.browserToken, { ...c, userId: other.userId }),
    ).rejects.toThrow();
    await expect(a.core.complete(a.callback, a.attempt.browserToken, other)).rejects.toThrow();
    await a.core.complete(a.callback, a.attempt.browserToken, c);
    await expect(
      db.transaction((con) => store.consumeEvidence(con, { ...a.ref, context: other })),
    ).rejects.toThrow();
    await db.execute(`UPDATE identity_binding_operations SET revoked_at=${timeSQL} WHERE id=?`, [
      c.operationId,
    ]);
    await expect(db.transaction((con) => store.consumeEvidence(con, a.ref))).rejects.toThrow();
    await a.core.invalidate(a.attempt.attemptId, a.attempt.browserToken, c);
    expect((await row(a.attempt.attemptId)).subject).toBeNull();
  });
  it('reauth requires the exact initiating session and current Google identity; revocation blocks consumption', async () => {
    const c = await reauth(),
      a = await start(c);
    // Valid Google proof from a different Google account is insufficient for reauth.
    const wrongAccount = a.google.use(a.attempt.authorizationUrl, {
      claims: { auth_time: Math.floor(Date.now() / 1000) },
    });
    await expect(a.core.complete(wrongAccount, a.attempt.browserToken, c)).rejects.toThrow();
    const b = await start(c),
      time = Math.floor(Date.now() / 1000) - 60;
    const callback = b.google.use(b.attempt.authorizationUrl, {
      claims: { sub: 'synthetic-google-sub-' + c.userId, auth_time: time },
    });
    await b.core.complete(callback, b.attempt.browserToken, c);
    expect(Number((await row(b.attempt.attemptId)).expires_at)).toBeLessThanOrEqual(
      time * 1000 + 300000,
    );
    await db.execute(`UPDATE identity_sessions SET revoked_at=${timeSQL} WHERE token_hash=?`, [
      c.sessionHash,
    ]);
    await expect(db.transaction((con) => store.consumeEvidence(con, b.ref))).rejects.toThrow();
    await expect(start(c)).rejects.toThrow();
  });
  it('evidence consumption rolls back with caller effect and has one concurrent winner', async () => {
    const a = await verified();
    await expect(
      db.transaction(async (con) => {
        await store.consumeEvidence(con, a.ref);
        throw Error('Synthetic caller effect failure');
      }),
    ).rejects.toThrow('Synthetic caller');
    expect((await row(a.attempt.attemptId)).status).toBe('verified');
    const results = await Promise.allSettled([
      db.transaction((con) => store.consumeEvidence(con, a.ref)),
      db.transaction((con) => store.consumeEvidence(con, a.ref)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await row(a.attempt.attemptId)).status).toBe('consumed');
  });
  it('expired or invalidated evidence cannot be consumed; failed verification rolls back', async () => {
    const a = await verified();
    await db.execute(`UPDATE identity_oidc_attempts SET expires_at=${timeSQL}-1 WHERE id=?`, [
      a.attempt.attemptId,
    ]);
    await expect(db.transaction((con) => store.consumeEvidence(con, a.ref))).rejects.toThrow();
    const b = await verified();
    await b.core.invalidate(b.attempt.attemptId, b.attempt.browserToken, b.context);
    await expect(db.transaction((con) => store.consumeEvidence(con, b.ref))).rejects.toThrow();
    const c = await start();
    const original = db.execute;
    vi.spyOn(db, 'execute').mockImplementation(async (sql, values, connection) => {
      const result = await original(sql, values, connection);
      if (sql.includes("SET status='verified'"))
        throw Error('Synthetic post-write persistence failure');
      return result;
    });
    await expect(c.core.complete(c.callback, c.attempt.browserToken, c.context)).rejects.toThrow();
    expect((await row(c.attempt.attemptId)).status).toBe('invalidated');
    expect((await row(c.attempt.attemptId)).subject).toBeNull();
  });
  it('schema rejects inconsistent states, duplicate state hashes and nonexistent references', async () => {
    const a = await start(),
      before = await row(a.attempt.attemptId);
    await expect(
      db.execute("UPDATE identity_oidc_attempts SET status='verified' WHERE id=?", [
        a.attempt.attemptId,
      ]),
    ).rejects.toThrow();
    await expect(
      db.execute("UPDATE identity_oidc_attempts SET purpose='binding' WHERE id=?", [
        a.attempt.attemptId,
      ]),
    ).rejects.toThrow();
    await expect(
      db.execute('UPDATE identity_oidc_attempts SET expires_at=created_at+300001 WHERE id=?', [
        a.attempt.attemptId,
      ]),
    ).rejects.toThrow();
    const b = await start();
    await expect(
      db.execute('UPDATE identity_oidc_attempts SET state_hash=? WHERE id=?', [
        before.state_hash,
        b.attempt.attemptId,
      ]),
    ).rejects.toThrow();
    await expect(
      db.execute(
        "UPDATE identity_oidc_attempts SET purpose='binding',user_id=?,binding_operation_id=? WHERE id=?",
        [randomUUID(), randomUUID(), a.attempt.attemptId],
      ),
    ).rejects.toThrow();
    expect(await row(a.attempt.attemptId)).toEqual(before);
  });
  it('cleanup erases expired secrets/evidence and purges only eligible attempt records', async () => {
    const a = await start(),
      b = await verified(),
      c = await start();
    const before = await counts();
    await db.execute(
      `UPDATE identity_oidc_attempts SET created_at=${timeSQL}-90000000,expires_at=${timeSQL}-89900000 WHERE id=?`,
      [a.attempt.attemptId],
    );
    await db.execute(`UPDATE identity_oidc_attempts SET expires_at=${timeSQL}-1 WHERE id=?`, [
      b.attempt.attemptId,
    ]);
    await store.cleanup();
    expect(await row(a.attempt.attemptId)).toBeUndefined();
    expect((await row(b.attempt.attemptId)).status).toBe('invalidated');
    expect((await row(b.attempt.attemptId)).subject).toBeNull();
    expect((await row(c.attempt.attemptId)).status).toBe('pending');
    expect(await counts()).toEqual(before);
  });
  it('runner refuses 019 structures without registration without mutating migration history', async () => {
    const getConnection = db.pool.getConnection.bind(db.pool);
    vi.spyOn(db.pool, 'getConnection').mockImplementation(async () => {
      const connection = await getConnection();
      const execute = connection.execute.bind(connection);
      vi.spyOn(connection, 'execute').mockImplementation((async (sql: any, values: any) => {
        if (sql === 'SELECT name FROM schema_migrations WHERE name=?' && values?.[0] === '019.sql')
          return [[], []];
        return execute(sql, values);
      }) as typeof connection.execute);
      return connection;
    });
    await expect(migrate('019.sql')).rejects.toThrow('estructura parcial');
  });
});
