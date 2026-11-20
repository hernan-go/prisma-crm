import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { requireSessionOperation, safeDiagnostic } from '../scripts/portal-cli-session';

describe('private CLI supervisor diagnostics', () => {
  it('classifies validation without exposing invalid inputs', () => {
    expect(
      safeDiagnostic({ name: 'ZodError', message: 'SECRET', issues: ['SECRET'] }, 'member'),
    ).toEqual({ stage: 'member', category: 'validation', class: 'ZodError' });
    expect(safeDiagnostic({ name: 'AppError', message: 'SECRET' }, 'confirmation_or_seal')).toEqual(
      {
        stage: 'confirmation_or_seal',
        category: 'validation',
        class: 'AppError',
      },
    );
  });
  it('classifies MySQL without exposing SQL or parameter values', () => {
    const diagnostic = safeDiagnostic(
      {
        name: 'Error',
        code: 'ER_ACCESS_DENIED_ERROR',
        sqlState: '28000',
        sql: 'SECRET',
        sqlMessage: 'SECRET',
        message: 'SECRET',
      },
      'confirmation_or_seal',
    );
    expect(diagnostic.category).toBe('mysql');
    expect(diagnostic.code).toBe('ER_ACCESS_DENIED_ERROR');
    expect(JSON.stringify(diagnostic)).not.toContain('SECRET');
  });
  it('distinguishes transport and rejects arbitrary error fields', () => {
    expect(safeDiagnostic({ code: 'ECONNRESET' }, 'credential').category).toBe('transport');
    expect(safeDiagnostic({ code: 'PROTOCOL_CONNECTION_LOST' }, 'load')).toEqual({
      stage: 'load',
      category: 'transport',
      class: 'UnknownError',
      code: 'PROTOCOL_CONNECTION_LOST',
    });
    expect(safeDiagnostic({ code: 'ER_LOCK_DEADLOCK' }, 'confirmation_or_seal').category).toBe(
      'mysql',
    );
    expect(safeDiagnostic({ name: 'SECRET', code: 'SECRET', sqlState: 'SECRET' }, 'load')).toEqual({
      stage: 'load',
      category: 'cli',
      class: 'UnknownError',
    });
  });
});

describe('private CLI supervisor operation identity', () => {
  const persistedId = '00000000-0000-4000-8000-000000000001';

  it('requires a persisted operation ID before prepare or recovery', () => {
    expect(() => requireSessionOperation('prepare', undefined)).toThrow();
    expect(() => requireSessionOperation('seal-receipt', 'invalid')).toThrow();
    expect(requireSessionOperation('prepare', persistedId)).toBe(persistedId);
    expect(requireSessionOperation('seal-receipt', persistedId)).toBe(persistedId);
  });

  it('rejects every other CLI command at runtime', () => {
    expect(() => requireSessionOperation('enable', persistedId)).toThrow();
    expect(() => requireSessionOperation('h2-apply', persistedId)).toThrow();
  });
});

describe('encoded PowerShell bootstrap', () => {
  it('loads the supervisor and returns a sanitized diagnostic before asking for a session', () => {
    const launcher = readFileSync(resolve('scripts/start-portal-cli-session.ps1'), 'utf8');
    const template = launcher.match(/\$bootstrap = @"\r?\n([\s\S]*?)\r?\n"@/)?.[1];
    expect(template).toBeDefined();
    const supervisor = ts.transpileModule(
      readFileSync(resolve('scripts/portal-cli-session.ts'), 'utf8'),
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
    ).outputText;
    const source64 = Buffer.from(supervisor).toString('base64');
    for (const command of ['prepare', 'seal-receipt']) {
      const bootstrap = template!
        .replaceAll('$operationId', '00000000-0000-4000-8000-000000000001')
        .replaceAll('$source64', source64)
        .replaceAll('$ExpectedMysqlUuid', '00000000-0000-4000-8000-000000000001')
        .replaceAll('$command', command)
        .replace('../../.env-local', '__prisma_audit_missing_env__');
      const encoded = Buffer.from(bootstrap).toString('base64');
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "await import('data:text/javascript;base64," + encoded + "')",
        ],
        {
          cwd: resolve('.'),
          env: {
            SystemRoot: process.env.SystemRoot,
            TEMP: process.env.TEMP,
            USERPROFILE: process.env.USERPROFILE,
          },
          encoding: 'utf8',
          timeout: 10000,
        },
      );
      expect(result.status, result.stderr.slice(0, 400)).toBe(2);
      expect(JSON.parse(result.stderr.trim())).toEqual({
        stage: 'launcher',
        category: 'cli',
        class: 'Error',
      });
    }
  });
});
