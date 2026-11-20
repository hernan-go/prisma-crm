import { describe, expect, it } from 'vitest';
import { safeDiagnostic } from '../scripts/portal-cli-session';

describe('private CLI supervisor diagnostics', () => {
  it('classifies validation without exposing invalid inputs', () => {
    expect(
      safeDiagnostic({ name: 'ZodError', message: 'SECRET', issues: ['SECRET'] }, 'member'),
    ).toEqual({ stage: 'member', category: 'validation', class: 'ZodError' });
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
    expect(safeDiagnostic({ name: 'SECRET', code: 'SECRET', sqlState: 'SECRET' }, 'load')).toEqual({
      stage: 'load',
      category: 'cli',
      class: 'UnknownError',
    });
  });
});
