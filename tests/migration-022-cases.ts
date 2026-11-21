// Registered inside portal-db.test.ts: uses its NEW accredited schema and fixture.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { execute, pool, query } from '../server/db';
import { migrate } from '../server/migrate';
import { auditCheckShape, preflight022 } from '../server/migration-022';
import { createPortalAccessService } from '../server/portal-access';
import { createMysqlPortalUnitOfWork } from '../server/portal-policy';
import type { PortalContext, PortalMember } from '../shared/portal';

const pattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const badPattern = pattern.replace('-[0-9a-f]{12}', '-[0-9a-f]{4}-[0-9a-f]{12}');
const check = (p = pattern) =>
  `operation_id IS NULL OR (details_json IS NOT NULL AND JSON_TYPE(details_json)='OBJECT' AND operation_id REGEXP '${p}')`;
const replaceCheck = (clause: string, enforced = true) =>
  execute(
    `ALTER TABLE identity_audit_events DROP CHECK chk_identity_audit_operation, ADD CONSTRAINT chk_identity_audit_operation CHECK (${clause}) ${enforced ? 'ENFORCED' : 'NOT ENFORCED'}`,
  );
async function currentCheck() {
  const [row] = await query(
    "SELECT CHECK_CLAUSE clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='chk_identity_audit_operation'",
  );
  return row?.clause as string | undefined;
}
async function state() {
  return {
    state: await query(
      'SELECT enabled,pilot_sealed,admissions_open,CAST(revision AS CHAR) revision,CAST(security_seq AS CHAR) security_seq FROM portal_access_state',
    ),
    links: await query('SELECT * FROM identity_instructor_links ORDER BY user_id'),
    audits: await query('SELECT * FROM identity_audit_events ORDER BY id'),
  };
}

export function migration022Tests(context: PortalContext, members: () => PortalMember[]) {
  describe('022 audit UUID repair', () => {
    beforeEach(async () => {
      await execute("DELETE FROM schema_migrations WHERE name='022.sql'");
      if (await currentCheck()) await replaceCheck(check());
      else
        await execute(
          `ALTER TABLE identity_audit_events ADD CONSTRAINT chk_identity_audit_operation CHECK (${check()})`,
        );
    });

    it.each(['correct', 'defective'])(
      'repairs %s baseline, seals and recovers in a new process',
      async (variant) => {
        if (variant === 'defective') await replaceCheck(check(badPattern));
        const legacyId = randomUUID();
        await execute('INSERT INTO identity_audit_events(user_id,event) VALUES (?,?)', [
          context.userId,
          'synthetic.legacy',
        ]);
        if (variant === 'correct')
          await execute(
            'INSERT INTO identity_audit_events(user_id,event,operation_id,details_json) VALUES (?,?,?,?)',
            [context.userId, 'synthetic.existing', legacyId, '{}'],
          );
        const beforeAudit = await query('SELECT * FROM identity_audit_events ORDER BY id');
        const beforeOther = await query(
          "SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME<>'chk_identity_audit_operation' ORDER BY CONSTRAINT_NAME",
        );
        await migrate('022.sql');
        expect(auditCheckShape((await currentCheck())!)).toBe(auditCheckShape(check()));
        expect(await query('SELECT * FROM identity_audit_events ORDER BY id')).toEqual(beforeAudit);
        expect(
          await query(
            "SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME<>'chk_identity_audit_operation' ORDER BY CONSTRAINT_NAME",
          ),
        ).toEqual(beforeOther);
        const history = await query("SELECT * FROM schema_migrations WHERE name='022.sql'");
        expect(history).toHaveLength(1);
        await migrate('022.sql');
        expect(await query("SELECT * FROM schema_migrations WHERE name='022.sql'")).toEqual(
          history,
        );
        const service = createPortalAccessService(createMysqlPortalUnitOfWork(), randomBytes(32));
        const id = randomUUID();
        const result = await service.sealPilot(
          context,
          id,
          await service.preparePilot(context, members()),
        );
        expect(result).toMatchObject({ revision: '1', securitySeq: '1', changed: true });
        const after = await state();
        expect(after.state).toEqual([
          { enabled: 0, pilot_sealed: 1, admissions_open: 0, revision: '1', security_seq: '1' },
        ]);
        expect(after.links.map((l) => String(l.min_login_seq))).toEqual(['1', '1']);
        expect(after.links.map((l) => [l.user_id, l.instructor_id])).toEqual(
          [...members()]
            .sort((a, b) => a.userId.localeCompare(b.userId))
            .map((m) => [m.userId, m.instructorId]),
        );
        expect(after.audits.filter((a) => a.event === 'portal.pilot.sealed')).toHaveLength(1);

        const code = `
        import { pool } from './server/db.ts';
        import { guardPool } from './tests/guarded-mysql.ts';
        import { createPortalAccessService } from './server/portal-access.ts';
        import { createMysqlPortalUnitOfWork } from './server/portal-policy.ts';
        import { randomBytes } from 'node:crypto';
        guardPool(pool);
        try {
          const input=JSON.parse(process.env.PWA022_SYNTHETIC_RECOVERY);
          const service=createPortalAccessService(createMysqlPortalUnitOfWork(),randomBytes(32));
          console.log(JSON.stringify(await service.recoverSeal(input.context,input.id,'0',input.members)));
        } finally { await pool.end(); }
      `;
        const recovered = await promisify(execFile)(
          process.execPath,
          ['--import', 'tsx', '--input-type=module', '-e', code],
          {
            env: {
              ...process.env,
              PWA022_SYNTHETIC_RECOVERY: JSON.stringify({ context, id, members: members() }),
            },
          },
        );
        expect(JSON.parse(recovered.stdout.trim())).toEqual(result);
        expect(await state()).toEqual(after);
      },
    );

    it('reproduces the defective audit CHECK and rolls back the entire seal', async () => {
      await replaceCheck(check(badPattern));
      const service = createPortalAccessService(createMysqlPortalUnitOfWork(), randomBytes(32));
      const before = await state();
      await expect(
        service.sealPilot(context, randomUUID(), await service.preparePilot(context, members())),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
      expect(await state()).toEqual(before);
      expect(await query("SELECT * FROM schema_migrations WHERE name='022.sql'")).toHaveLength(0);
    });

    it.each(['missing', 'disabled', 'unexpected', 'regrouped', 'invalid-data', 'missing-baseline'])(
      'rejects %s preflight without DDL or history changes',
      async (variant) => {
        if (variant === 'missing')
          await execute(
            'ALTER TABLE identity_audit_events DROP CHECK chk_identity_audit_operation',
          );
        if (variant === 'disabled' || variant === 'invalid-data')
          await replaceCheck(check(), false);
        if (variant === 'unexpected') await replaceCheck('operation_id IS NULL');
        if (variant === 'regrouped')
          await replaceCheck(
            `(operation_id IS NULL OR details_json IS NOT NULL) AND JSON_TYPE(details_json)='OBJECT' AND operation_id REGEXP '${pattern}'`,
          );
        if (variant === 'invalid-data') {
          await execute(
            'INSERT INTO identity_audit_events(user_id,event,operation_id,details_json) VALUES (?,?,?,?)',
            [context.userId, 'synthetic.invalid', 'invalid', '{}'],
          );
        }
        if (variant === 'missing-baseline')
          await execute("DELETE FROM schema_migrations WHERE name='021.sql'");
        const before = await currentCheck();
        const snapshot = await state();
        try {
          if (variant === 'missing-baseline') {
            const connection = await pool.getConnection();
            try {
              await expect(preflight022(connection)).rejects.toThrow('022.sql requiere 021.sql');
            } finally {
              connection.release();
            }
          } else await expect(migrate('022.sql')).rejects.toThrow('022.sql');
          expect(await currentCheck()).toBe(before);
          expect(await state()).toEqual(snapshot);
          expect(await query("SELECT * FROM schema_migrations WHERE name='022.sql'")).toHaveLength(
            0,
          );
        } finally {
          if (variant === 'missing-baseline')
            await execute("INSERT INTO schema_migrations(name) VALUES ('021.sql')");
        }
      },
    );

    it('preserves UUID/JSON/unique/size checks and legacy NULL operations', async () => {
      await migrate('022.sql');
      const insert = (id: string | null, details: string | null) =>
        execute(
          'INSERT INTO identity_audit_events(user_id,event,operation_id,details_json) VALUES (?,?,?,?)',
          [context.userId, 'synthetic.receipt', id, details],
        );
      const id = randomUUID();
      await insert(id, '{}');
      await insert(null, null);
      await expect(insert(id, '{}')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      for (const [operation, details] of [
        [randomUUID(), null],
        [randomUUID(), '[]'],
        ['invalid', '{}'],
        [randomUUID(), JSON.stringify({ text: 'x'.repeat(17000) })],
      ])
        await expect(insert(operation, details)).rejects.toMatchObject({
          code: 'ER_CHECK_CONSTRAINT_VIOLATED',
        });
      await expect(insert('f'.repeat(36), '{}')).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED',
      });
      await expect(
        execute(
          'INSERT INTO identity_instructor_links(user_id,instructor_id,pilot_slot,status,revision,min_login_seq) VALUES (?,?,?,?,?,?)',
          [members()[0].userId, members()[0].instructorId, 1, 'enabled', '1', '0'],
        ),
      ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    });

    it.each([false, true])(
      'stops on unconfirmed registration, even with cleanup failure=%s',
      async (cleanupFailure) => {
        await replaceCheck(check(badPattern));
        const acquire = pool.getConnection.bind(pool);
        let ddlCalls = 0;
        const spy = vi.spyOn(pool, 'getConnection').mockImplementationOnce(async () => {
          const connection = await acquire();
          return new Proxy(connection, {
            get(target, property) {
              if (property === 'query')
                return async (sql: string, ...args: any[]) => {
                  if (sql.includes('DROP CHECK chk_identity_audit_operation')) ddlCalls++;
                  const result = await (target.query as any)(sql, ...args);
                  if (cleanupFailure && sql.includes('RELEASE_LOCK'))
                    throw Error('synthetic cleanup failure');
                  return result;
                };
              if (property === 'rollback' && cleanupFailure)
                return async () => {
                  await target.rollback();
                  throw Error('synthetic cleanup failure');
                };
              if (property === 'execute')
                return async (sql: string, values: any[]) => {
                  if (
                    sql === 'INSERT INTO schema_migrations(name) VALUES (?)' &&
                    values[0] === '022.sql'
                  )
                    throw Error('synthetic history failure');
                  return (target.execute as any)(sql, values);
                };
              const value = Reflect.get(target, property);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        });
        try {
          await expect(migrate('022.sql')).rejects.toThrow(
            'DDL completado pero registro no confirmado',
          );
        } finally {
          spy.mockRestore();
        }
        expect(ddlCalls).toBe(1);
        expect(auditCheckShape((await currentCheck())!)).toBe(auditCheckShape(check()));
        expect(await query("SELECT * FROM schema_migrations WHERE name='022.sql'")).toHaveLength(0);
        // Simulates the separately authorized owner's registration-only recovery.
        await execute("INSERT INTO schema_migrations(name) VALUES ('022.sql')");
        expect(await query("SELECT * FROM schema_migrations WHERE name='022.sql'")).toHaveLength(1);
      },
    );
  });
}
