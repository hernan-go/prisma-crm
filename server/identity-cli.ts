import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { pool } from './db.js';
import { operatorBindings } from './binding-operations.js';
import { revokeIdentitySessions } from './identity.js';
import { z } from 'zod';

export async function runIdentityCli(args: string[]) {
  // No commands accepted over HTTP. OS access to this process and DB is the authority.
  const [command, database, ...values] = args;
  if (
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    !database ||
    !process.env.DB_NAME ||
    database !== process.env.DB_NAME
  )
    throw Error('Use an interactive privileged terminal and explicit matching database.');
  const operator = operatorBindings(database);
  await operator.preflight();
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const confirm = async (label: string, userId?: string) => {
    const phrase = `CONFIRM ${database} ${command}${userId ? ` ${userId}` : ''}`;
    if ((await terminal.question(`${label}\nType ${phrase}: `)) !== phrase)
      throw Error('Cancelled.');
  };
  try {
    if (command === 'revoke-sessions') {
      if (values.length !== 1) throw Error('Expected one user UUID.');
      const userId = z.string().uuid().parse(values[0]);
      await confirm(`Revoke ALL individual sessions for user ${userId} in ${database}?`, userId);
      // Recheck after human input. The service verifies existence under lock and
      // commits revocation and sessions.revoked audit together (NULL = operator).
      await operator.preflight();
      await revokeIdentitySessions(userId, null);
      console.log('Individual sessions revoked for the confirmed user.');
      return;
    }
    if (command === 'preflight') {
      console.log({ database, schema: '017–019 ready' });
      return;
    }
    if (command === 'status') {
      console.table(await operator.status());
      return;
    }
    if (command === 'prepare') {
      if (values.length) throw Error('Unexpected arguments.');
      const ids: [string, string] = [randomUUID(), randomUUID()];
      console.log({ Jesica: ids[0], Hernan: ids[1] });
      await confirm('Create these two disabled identities and configure bootstrap atomically?');
      await operator.prepare(ids);
      console.log('Bootstrap configured.');
      return;
    }
    if (command === 'configure') {
      if (values.length !== 2) throw Error('Expected two existing disabled UUIDs.');
      await confirm(`Configure Jesica=${values[0]}, Hernan=${values[1]}?`);
      await operator.configure(values as [string, string]);
      return;
    }
    if (command === 'issue') {
      const [userId, purpose] = values;
      if (values.length !== 2 || !['initial', 'replace'].includes(purpose))
        throw Error('Expected UUID and initial|replace.');
      await confirm(
        `Issue ${purpose} authorization for ${userId}? Deliver the code privately, never in a URL.`,
      );
      const issued = await operator.issue(userId, purpose as 'initial' | 'replace');
      console.log(issued);
      return; // The authorized one-time code delivery, not a log.
    }
    if (command === 'inspect' || command === 'approve') {
      if (values.length !== 2) throw Error('Expected operation UUID and user UUID.');
      const inspected = await operator.inspect(values[0], values[1]);
      console.log(inspected);
      if (command === 'inspect') return;
      const fingerprint = await terminal.question(
        'Independently verify the person and their browser receipt. Paste that exact fingerprint: ',
      );
      if (fingerprint !== inspected.fingerprint) throw Error('Candidate mismatch.');
      await confirm('Approve ONLY this supervised Google candidate?');
      await operator.approve(values[0], values[1], fingerprint);
      console.log('Candidate approved.');
      return;
    }
    if (command === 'revoke') {
      if (values.length !== 2) throw Error('Expected operation UUID and user UUID.');
      await confirm(`Revoke operation ${values[0]} for ${values[1]}?`);
      await operator.revoke(values[0], values[1]);
      return;
    }
    if (command === 'maintain') {
      await confirm('Clean expired OIDC data; preserve institutional operations and audit?');
      await operator.maintain();
      return;
    }
    throw Error(
      'Commands: preflight, status, prepare, configure, issue, inspect, approve, revoke, revoke-sessions, maintain.',
    );
  } finally {
    terminal.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runIdentityCli(process.argv.slice(2));
  } catch {
    console.error(
      'Identity operation not completed. Check destination, state and confirmations; no unsafe fallback.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
