// Private terminal supervisor. Does not change CLI decisions or retry mutations.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function safeDiagnostic(error: unknown, stage: string) {
  const e = error as {
    name?: unknown;
    code?: unknown;
    sqlState?: unknown;
    message?: unknown;
  } | null;
  const name = typeof e?.name === 'string' ? e.name : '';
  const code = typeof e?.code === 'string' ? e.code : '';
  const sqlState = typeof e?.sqlState === 'string' ? e.sqlState : '';
  const mysqlCode = /^ER_[A-Z0-9_]{1,64}$/.test(code);
  const transportCode = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND',
    'EAI_AGAIN',
    'PROTOCOL_CONNECTION_LOST',
  ].includes(code);
  return {
    stage,
    category:
      /^[A-Z0-9]{5}$/.test(sqlState) || mysqlCode
        ? 'mysql'
        : transportCode
          ? 'transport'
          : name === 'ZodError' || name === 'AppError'
            ? 'validation'
            : 'cli',
    class: ['Error', 'AppError', 'ZodError', 'TypeError', 'RangeError'].includes(name)
      ? name
      : 'UnknownError',
    reason: e?.message === 'Cancelado.' ? 'confirmation_rejected' : undefined,
    // No message, stack, SQL, parameters, values, cause or arbitrary properties.
    code: mysqlCode || transportCode ? code : undefined,
    sqlState: /^[A-Z0-9]{5}$/.test(sqlState) ? sqlState : undefined,
  };
}

export function requireSessionOperation(command: string, operationId: string | undefined) {
  if (command !== 'prepare' && command !== 'seal-receipt')
    throw Error('Unsupported private session command');
  if (
    !operationId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)
  )
    throw Error('Persisted operation ID required');
  return operationId;
}

export async function privateSession(
  args: string[],
  command: 'prepare' | 'seal-receipt' = 'prepare',
) {
  const operationId = requireSessionOperation(command, process.env.PORTAL_RECOVERY_OPERATION_ID);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('TTY required');
  if (args.length !== 4) throw Error('Explicit target required');
  let stage = 'load';
  const preparationKey = randomBytes(32).toString('hex');
  const originalWrite = process.stdout.write.bind(process.stdout);
  let tail = '';
  let injecting = false;
  let recovering = false;
  let cliCompleted = false;
  process.stdout.write = ((chunk: any, ...rest: any[]) => {
    const text = String(chunk);
    tail = (tail + text).slice(-512);
    const prompts: [string, string][] = [
      ['UUID administrador > ', 'actor'],
      ['Sesión CRM individual (sin eco) > ', 'credential'],
      ['Clave privada de preparación (hex) (sin eco) > ', 'hmac'],
      ['UUID institucional > ', 'member'],
      ['ID de instructor > ', 'member'],
      ['Google sub exacto (sin eco) > ', 'member'],
      ['Acción posterior (seal o salir) > ', 'plan_review'],
      ['UUID operación seal > ', 'operation'],
      ['Escriba SELLAR ', 'confirmation_or_seal'],
      ['UUID original del sellado > ', 'receipt_operation'],
      ['Revisión original del plan > ', 'receipt_revision'],
    ];
    for (const [prompt, next] of prompts) if (tail.includes(prompt)) stage = next;
    let answer: string | undefined;
    if (tail.endsWith('UUID operación seal > ')) answer = operationId;
    if (tail.endsWith('Clave privada de preparación (hex) (sin eco) > ')) answer = preparationKey;
    if (recovering && tail.endsWith('UUID original del sellado > ')) answer = operationId;
    if (answer && !injecting) {
      injecting = true;
      const value = answer;
      setImmediate(() => {
        tail = '';
        process.stdin.emit('data', Buffer.from(value + '\n'));
        injecting = false;
      });
    }
    return (originalWrite as any)(chunk, ...rest);
  }) as typeof process.stdout.write;
  try {
    const { runPortalCli } = await import(pathToFileURL(resolve('dist/server/portal-cli.js')).href);
    const { pool } = await import(pathToFileURL(resolve('dist/server/db.js')).href);
    try {
      const { parseTarget, verifyTarget } = await import(
        pathToFileURL(resolve('dist/server/portal-operations.js')).href
      );
      const target = parseTarget(args);
      const connection = await pool.getConnection();
      try {
        stage = 'target_preflight';
        await verifyTarget(connection, target);
        if (command === 'prepare') {
          const [rows] = await connection.query(
            'SELECT enabled,pilot_sealed,admissions_open,CAST(revision AS CHAR) revision FROM portal_access_state WHERE id=1',
          );
          const [links] = await connection.query('SELECT user_id FROM identity_instructor_links');
          if (
            rows.length !== 1 ||
            rows[0].enabled ||
            rows[0].pilot_sealed ||
            rows[0].admissions_open ||
            rows[0].revision !== '0' ||
            links.length
          )
            throw Error('Preconditions changed');
        }
      } catch (error) {
        originalWrite(JSON.stringify(safeDiagnostic(error, stage)) + '\nCLI_EXIT_CODE=1\n');
        process.exitCode = 1;
        return;
      } finally {
        connection.release();
      }
      try {
        recovering = command === 'seal-receipt';
        await runPortalCli([command, ...args]);
        cliCompleted = true;
      } catch (error) {
        originalWrite(JSON.stringify(safeDiagnostic(error, stage)) + '\nCLI_EXIT_CODE=1\n');
        process.exitCode = 1;
      } finally {
        recovering = false;
      }
      // Exactly one CLI lifecycle per TTY. Recovery starts a fresh read-only
      // process using the ID saved by the Windows DPAPI launcher, never prepare.
    } finally {
      await pool.end();
    }
    if (cliCompleted) originalWrite('CLI_EXIT_CODE=0\n');
  } finally {
    process.stdout.write = originalWrite;
    process.stdin.pause();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await privateSession(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify(safeDiagnostic(error, 'launcher')));
    process.exitCode = 2;
  }
}
