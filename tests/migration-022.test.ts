import { describe, expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { auditCheckShape, preflight022 } from '../server/migration-022';

const pattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const expression = `operation_id IS NULL OR (details_json IS NOT NULL AND JSON_TYPE(details_json)='OBJECT' AND operation_id REGEXP '${pattern}')`;

describe('022 CHECK metadata comparison', () => {
  it('recognizes MySQL rendering without losing boolean structure', () => {
    expect(
      auditCheckShape(
        `((\`operation_id\` is null) or ((\`details_json\` is not null) and (json_type(\`details_json\`) = _utf8mb4'OBJECT') and regexp_like(\`operation_id\`,_utf8mb4'${pattern}')))`,
      ),
    ).toBe(auditCheckShape(expression));
  });
  it('recognizes escaped literal delimiters returned by MySQL 8.4 metadata', () => {
    const metadata = `((\`operation_id\` is null) or ((\`details_json\` is not null) and (json_type(\`details_json\`) = _utf8mb4\\'OBJECT\\') and regexp_like(\`operation_id\`,_utf8mb4\\'${pattern}\\')))`;
    expect(auditCheckShape(metadata)).toBe(auditCheckShape(expression));
  });
  it('rejects a regrouped expression with different NULL semantics', () => {
    expect(
      auditCheckShape(
        `(operation_id IS NULL OR details_json IS NOT NULL) AND JSON_TYPE(details_json)='OBJECT' AND operation_id REGEXP '${pattern}'`,
      ),
    ).not.toBe(auditCheckShape(expression));
  });
  it('preserves literals, regex anchors and additional predicates', () => {
    for (const altered of [
      expression.replace("'OBJECT'", "'object'"),
      expression.replace('^', ''),
      expression + ' OR operation_id IS NOT NULL',
    ])
      expect(auditCheckShape(altered)).not.toBe(auditCheckShape(expression));
  });
  it('fails closed on unsupported or unbalanced expressions', () => {
    for (const altered of [expression + ' # comment', '(' + expression, expression + ')'])
      expect(() => auditCheckShape(altered)).toThrow();
  });
  it('rejects incompatible existing rows before the caller can run DDL', async () => {
    const connection = {
      execute: vi.fn().mockResolvedValue([[{ name: '021.sql' }]]),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ engine: 'InnoDB' }]])
        .mockResolvedValueOnce([
          [
            { name: 'operation_id', type: 'char', nullable: 'YES', length: 36 },
            { name: 'details_json', type: 'json', nullable: 'YES', length: null },
          ],
        ])
        .mockResolvedValueOnce([[{ clause: expression, enforced: 'YES' }]])
        .mockResolvedValueOnce([[{ invalid: 1 }]]),
    };
    await expect(preflight022(connection as unknown as PoolConnection)).rejects.toThrow(
      'datos inesperados',
    );
    expect(connection.query.mock.calls.every(([sql]) => sql.startsWith('SELECT '))).toBe(true);
  });
});
