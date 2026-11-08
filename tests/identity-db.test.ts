import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool, query, execute } from '../server/db';
import { migrate } from '../server/migrate';
import * as identity from '../server/identity';
const users: string[] = [];
let safe = false;
afterAll(async () => {
  if (safe)
    for (const id of users) {
      await execute('DELETE FROM identity_audit_events WHERE user_id=?', [id]);
      await execute('DELETE FROM identity_sessions WHERE user_id=?', [id]);
      await execute('DELETE FROM identity_user_roles WHERE user_id=?', [id]);
      await execute('DELETE FROM identity_external_accounts WHERE user_id=?', [id]);
      await execute('DELETE FROM identity_users WHERE id=?', [id]);
    }
  await pool.end();
});
async function user() {
  const id = await identity.createIdentity('Synthetic identity QA', null);
  users.push(id);
  return id;
}
async function admin() {
  const id = await user();
  await identity.setIdentityRole(id, 'admin', true, null);
  await identity.setIdentityStatus(id, 'enabled', null);
  return id;
}
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('Identity MySQL prisma_test', () => {
  beforeAll(async () => {
    expect(process.env.DB_NAME).toBe('prisma_test');
    expect(['127.0.0.1', 'localhost', '::1']).toContain(process.env.DB_HOST || '127.0.0.1');
    expect((await query('SELECT DATABASE() name'))[0].name).toBe('prisma_test');
    // Prepare prerequisites ourselves under the runner's existing migration lock.
    // Safe on fresh CI and on an existing prisma_test; no reset or fixture deletion.
    await migrate('016.sql');
    expect((await query("SELECT name FROM schema_migrations WHERE name='016.sql'")).length).toBe(1);
    const legacy = await query('SELECT * FROM admin_sessions ORDER BY token_hash');
    const names = (await query('SHOW TABLES')).map((row) => Object.values(row)[0] as string);
    const definitions = await Promise.all(
      names.map((name) => query('SHOW CREATE TABLE `' + name.replaceAll('`', '``') + '`')),
    );
    await migrate('017.sql');
    safe = true;
    await migrate('017.sql');
    expect(await query('SELECT * FROM admin_sessions ORDER BY token_hash')).toEqual(legacy);
    for (let i = 0; i < names.length; i++)
      expect(await query('SHOW CREATE TABLE `' + names[i].replaceAll('`', '``') + '`')).toEqual(
        definitions[i],
      );
  });
  it('crea deshabilitado, identidad externa única incluso en carrera y sin reasignación', async () => {
    const a = await user(),
      b = await user(),
      subject = randomUUID();
    expect((await identity.getIdentity(a))?.status).toBe('disabled');
    const results = await Promise.allSettled([
      identity.linkExternalIdentity(a, 'google', subject, null),
      identity.linkExternalIdentity(b, 'google', subject, null),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const found = await identity.findExternalIdentity('google', subject);
    expect([a, b]).toContain(found?.id);
    await identity.linkExternalIdentity(found!.id, 'google', subject, null);
    await expect(
      identity.linkExternalIdentity(found!.id, 'google', randomUUID(), null),
    ).rejects.toThrow();
    await expect(execute('DELETE FROM identity_users WHERE id=?', [found!.id])).rejects.toThrow();
  });
  it('valida FK, estados, rol, proveedor, TTL y audita atómicamente sin tokens', async () => {
    const a = await user();
    await expect(
      execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'admin')", [randomUUID()]),
    ).rejects.toThrow();
    await expect(
      execute("UPDATE identity_users SET status='unknown' WHERE id=?", [a]),
    ).rejects.toThrow();
    await expect(
      execute("INSERT INTO identity_user_roles(user_id,role) VALUES (?,'superuser')", [a]),
    ).rejects.toThrow();
    await expect(
      identity.linkExternalIdentity(a, 'google', randomUUID(), randomUUID()),
    ).rejects.toThrow();
    expect(
      await query('SELECT * FROM identity_external_accounts WHERE user_id=?', [a]),
    ).toHaveLength(0);
    await expect(identity.createIdentitySession(a, 'crm', 1000)).rejects.toThrow();
    const b = await admin();
    await expect(identity.createIdentitySession(b, 'pwa', 1000)).rejects.toThrow();
    await expect(identity.createIdentitySession(b, 'crm', Infinity)).rejects.toThrow();
    const session = await identity.createIdentitySession(b, 'crm', 10000);
    expect(
      JSON.stringify(await query('SELECT * FROM identity_audit_events WHERE user_id=?', [b])),
    ).not.toContain(session.token);
    expect(
      (await query('SELECT token_hash FROM identity_sessions WHERE user_id=?', [b]))[0].token_hash,
    ).not.toBe(session.token);
  });
  it('logout individual, expiración, aplicación y revocación total', async () => {
    const a = await admin(),
      b = await admin();
    const first = await identity.createIdentitySession(a, 'crm', 10000),
      second = await identity.createIdentitySession(a, 'crm', 10000);
    expect((await identity.authenticateIdentitySession(first.token, 'crm'))?.id).toBe(a);
    expect(await identity.authenticateIdentitySession(first.token, 'pwa')).toBeUndefined();
    await identity.revokeIdentitySession(b, first.token, null);
    expect(await identity.authenticateIdentitySession(first.token, 'crm')).toBeDefined();
    await identity.revokeIdentitySession(a, first.token, null);
    expect(await identity.authenticateIdentitySession(first.token, 'crm')).toBeUndefined();
    expect(await identity.authenticateIdentitySession(second.token, 'crm')).toBeDefined();
    await identity.revokeIdentitySessions(a, null);
    expect(await identity.authenticateIdentitySession(second.token, 'crm')).toBeUndefined();
    const expired = await identity.createIdentitySession(a, 'crm', 10000);
    await execute('UPDATE identity_sessions SET created_at=?,expires_at=? WHERE token_hash=?', [
      Date.now() - 2000,
      Date.now() - 1000,
      identity.sessionDigest(expired.token),
    ]);
    expect(await identity.authenticateIdentitySession(expired.token, 'crm')).toBeUndefined();
  });
  it('suspensión y retiro/restauración de roles no resucitan sesiones; carrera emisión/suspensión', async () => {
    const a = await admin();
    const session = await identity.createIdentitySession(a, 'crm', 10000);
    await identity.setIdentityRole(a, 'admin', false, null);
    await identity.setIdentityRole(a, 'admin', true, null);
    expect(await identity.authenticateIdentitySession(session.token, 'crm')).toBeUndefined();
    const results = await Promise.allSettled([
      identity.createIdentitySession(a, 'crm', 10000),
      identity.setIdentityStatus(a, 'disabled', null),
    ]);
    expect(results[1].status).toBe('fulfilled');
    if (results[0].status === 'fulfilled') {
      const issued = results[0].value as { token: string };
      expect(await identity.authenticateIdentitySession(issued.token, 'crm')).toBeUndefined();
      await identity.setIdentityStatus(a, 'enabled', null);
      expect(await identity.authenticateIdentitySession(issued.token, 'crm')).toBeUndefined();
    }
  });
  it('detecta DDL sin registro sin alterar datos; recuperación controlada del registro QA', async () => {
    const before = await query('SELECT * FROM identity_users ORDER BY id');
    await execute("DELETE FROM schema_migrations WHERE name='017.sql'");
    try {
      await expect(migrate('017.sql')).rejects.toThrow('parcial');
    } finally {
      await execute("INSERT INTO schema_migrations(name) VALUES ('017.sql')");
    }
    expect(await query('SELECT * FROM identity_users ORDER BY id')).toEqual(before);
    const sql = await readFile('server/migrations/017.sql', 'utf8');
    expect(sql).not.toMatch(/CASCADE|ALTER TABLE|DROP TABLE/i);
  });
});
