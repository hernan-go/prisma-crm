// Manual TTY integration fixture. Only a NEW, externally accredited instance.
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { assertDisposableConnection } from '../server/disposable-database';
import { guardPool } from '../tests/guarded-mysql';

export async function qaPortalSession() {
  if (process.env.RUN_DB_TESTS !== 'true') throw Error('Explicit QA opt-in required');
  const { pool } = await import('../server/db');
  guardPool(pool);
  try {
    await assertDisposableConnection(async (sql) => (await pool.query(sql))[0] as any[]);
    const [tables] = await pool.query('SHOW TABLES');
    assert.deepEqual(
      (tables as any[]).map((r) => Object.values(r)[0]),
      ['prisma_test_disposable_marker'],
    );
    const { migrate } = await import('../server/migrate');
    await migrate('021.sql');
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    // Public synthetic test inputs only; never reuse outside this fixture.
    const token = '1'.repeat(64);
    for (let j = 0; j < 2; j++) {
      await pool.execute(
        "INSERT INTO identity_users(id,display_name,status) VALUES (?,?,'enabled')",
        [ids[j], 'Synthetic ' + j],
      );
      await pool.execute(
        "INSERT INTO identity_external_accounts(provider,subject,user_id) VALUES ('google',?,?)",
        ['synthetic-' + j, ids[j]],
      );
      await pool.execute(
        "INSERT INTO identity_user_roles(user_id,role) VALUES (?,'admin'),(?,'facilitator')",
        [ids[j], ids[j]],
      );
      await pool.execute('INSERT INTO instructors(id,name,active) VALUES (?,?,1)', [
        j + 1,
        'Synthetic ' + j,
      ]);
    }
    await pool.execute(
      'UPDATE identity_institution SET initialized=1,admin_one=?,admin_two=? WHERE id=1',
      ids,
    );
    await pool.execute(
      "INSERT INTO identity_sessions(token_hash,user_id,application,created_at,expires_at) VALUES (?,?,'crm',?,?)",
      [createHash('sha256').update(token).digest('hex'), ids[0], Date.now(), Date.now() + 3600000],
    );
    for (let scenario = 0; scenario < 3; scenario++) {
      console.log('SYNTHETIC_CLI_SCENARIO=' + scenario);
      process.env.PORTAL_RECOVERY_OPERATION_ID = randomUUID();
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/portal-cli-session.ts',
          process.env.DB_HOST!,
          process.env.DB_PORT!,
          process.env.DB_NAME!,
          process.env.TEST_DB_SERVER_UUID!,
        ],
        { stdio: 'inherit', env: process.env },
      );
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      if (scenario === 1) {
        console.log('SYNTHETIC_RECEIPT_FRESH_PROCESS');
        const receipt = spawn(
          process.execPath,
          [
            '--import',
            'tsx',
            '--input-type=module',
            '-e',
            "const {privateSession}=await import('./scripts/portal-cli-session.ts');await privateSession(process.argv.slice(1),'seal-receipt');",
            process.env.DB_HOST!,
            process.env.DB_PORT!,
            process.env.DB_NAME!,
            process.env.TEST_DB_SERVER_UUID!,
          ],
          { stdio: 'inherit', env: process.env },
        );
        const receiptCode = await new Promise((resolve, reject) => {
          receipt.once('error', reject);
          receipt.once('exit', resolve);
        });
        assert.equal(receiptCode, 0);
      }
      const [states] = await pool.query(
        'SELECT pilot_sealed,enabled,admissions_open,CAST(revision AS CHAR) revision FROM portal_access_state',
      );
      const [links] = await pool.query(
        'SELECT user_id,instructor_id,pilot_slot FROM identity_instructor_links ORDER BY pilot_slot',
      );
      const [audits] = await pool.query(
        "SELECT id FROM identity_audit_events WHERE event='portal.pilot.sealed'",
      );
      const sealed = scenario > 0;
      assert.equal(code, scenario === 1 ? 0 : 1);
      assert.equal((states as any[])[0].revision, sealed ? '1' : '0');
      assert.equal((states as any[])[0].pilot_sealed, sealed ? 1 : 0);
      assert.equal((states as any[])[0].enabled, 0);
      assert.equal((states as any[])[0].admissions_open, 0);
      assert.equal((audits as any[]).length, sealed ? 1 : 0);
      assert.deepEqual(
        links,
        sealed
          ? ids.map((user_id, j) => ({ user_id, instructor_id: j + 1, pilot_slot: j + 1 }))
          : [],
      );
      console.log(
        JSON.stringify({
          scenario,
          verified: true,
          revision: sealed ? '1' : '0',
          links: sealed ? 2 : 0,
          audits: sealed ? 1 : 0,
        }),
      );
    }
  } finally {
    await pool.end();
  }
}

// No implicit invocation, destination discovery, provisioning or credential file.
// An external owner harness supplies the accredited environment, then calls this.
