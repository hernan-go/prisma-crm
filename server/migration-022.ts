import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const defectivePattern = uuidPattern.replace('-[0-9a-f]{12}', '-[0-9a-f]{4}-[0-9a-f]{12}');
const expression = (pattern: string) =>
  `operation_id IS NULL OR (details_json IS NOT NULL AND JSON_TYPE(details_json)='OBJECT' AND operation_id REGEXP '${pattern}')`;

// Compare the boolean structure, not just text with parentheses removed. MySQL
// renders REGEXP as regexp_like and adds quoting/charset introducers in metadata.
export function auditCheckShape(clause: string): string {
  // Some 8.4 builds escape the literal delimiters in CHECK_CLAUSE. Only decode
  // paired delimiters whose content itself has no escapes or quotes.
  clause = clause.replace(/\\'([^'\\]*)\\'/g, "'$1'");
  const tokens: string[] = [];
  const lexer = /\s+|'(?:''|[^'])*'|`[a-zA-Z_][a-zA-Z_0-9]*`|[a-zA-Z_][a-zA-Z_0-9]*|[(),=]/gy;
  let offset = 0;
  while (offset < clause.length) {
    lexer.lastIndex = offset;
    const match = lexer.exec(clause);
    if (!match) throw Error('022.sql: expresión CHECK no reconocida.');
    offset = lexer.lastIndex;
    const token = match[0];
    if (/^\s+$/.test(token)) continue;
    tokens.push(token.startsWith("'") ? token : token.replaceAll('`', '').toLowerCase());
  }
  for (let i = tokens.length - 2; i >= 0; i--)
    if (/^_(utf8mb4|utf8mb3|utf8|ascii)$/.test(tokens[i]) && tokens[i + 1].startsWith("'"))
      tokens.splice(i, 1);

  function shape(input: string[]): string {
    let t = input;
    while (t[0] === '(') {
      let depth = 0,
        closing = -1;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === '(') depth++;
        if (t[i] === ')' && --depth === 0) {
          closing = i;
          break;
        }
      }
      if (closing !== t.length - 1) break;
      t = t.slice(1, -1);
    }
    for (const operator of ['or', 'and', 'regexp']) {
      let depth = 0;
      const pieces: string[][] = [];
      let start = 0;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === '(') depth++;
        if (t[i] === ')') depth--;
        if (depth < 0) throw Error('022.sql: expresión CHECK no reconocida.');
        if (depth === 0 && t[i] === operator) {
          pieces.push(t.slice(start, i));
          start = i + 1;
        }
      }
      if (depth !== 0) throw Error('022.sql: expresión CHECK no reconocida.');
      if (pieces.length) {
        pieces.push(t.slice(start));
        if (pieces.some((p) => !p.length)) throw Error('022.sql: expresión CHECK no reconocida.');
        const children = pieces.map(shape);
        return operator === 'regexp'
          ? `regexp_like(${children.join(',')})`
          : `${operator}(${children.join(',')})`;
      }
    }
    return t.join('');
  }
  return shape(tokens);
}

export async function preflight022(c: PoolConnection) {
  const fail = () =>
    Error('022.sql detenida: esquema o datos inesperados; inspeccionar antes de corregir.');
  const [baseline] = await c.execute<RowDataPacket[]>(
    "SELECT name FROM schema_migrations WHERE name='021.sql'",
  );
  if (baseline.length !== 1) throw Error('022.sql requiere 021.sql registrada.');
  const [tables] = await c.query<RowDataPacket[]>(
    "SELECT ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='identity_audit_events'",
  );
  if (tables.length !== 1 || tables[0].engine !== 'InnoDB') throw fail();
  const [columns] = await c.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME name,DATA_TYPE type,IS_NULLABLE nullable,CHARACTER_MAXIMUM_LENGTH length FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='identity_audit_events' AND COLUMN_NAME IN ('operation_id','details_json')",
  );
  const operation = columns.find((r) => r.name === 'operation_id');
  const details = columns.find((r) => r.name === 'details_json');
  if (
    columns.length !== 2 ||
    operation?.type !== 'char' ||
    Number(operation.length) !== 36 ||
    operation.nullable !== 'YES' ||
    details?.type !== 'json' ||
    details.nullable !== 'YES'
  )
    throw fail();
  const [checks] = await c.query<RowDataPacket[]>(
    "SELECT cc.CHECK_CLAUSE clause,tc.ENFORCED enforced FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME='identity_audit_events' AND tc.CONSTRAINT_TYPE='CHECK' AND tc.CONSTRAINT_NAME='chk_identity_audit_operation'",
  );
  if (checks.length !== 1 || checks[0].enforced !== 'YES') throw fail();
  if (
    ![uuidPattern, defectivePattern].some(
      (p) => auditCheckShape(expression(p)) === auditCheckShape(checks[0].clause),
    )
  )
    throw fail();
  const [invalid] = await c.query<RowDataPacket[]>(
    `SELECT COUNT(*) invalid FROM identity_audit_events WHERE NOT (${expression(uuidPattern)})`,
  );
  if (Number(invalid[0].invalid) !== 0) throw fail();
}
