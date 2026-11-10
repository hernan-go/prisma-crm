import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');
const verify = workflow.split('  verify:')[1].split('  integrations:')[0];
const integrations = workflow.split('  integrations:')[1];
const suites = integrations
  .split('        suite:')[1]
  .split('    services:')[0]
  .split('\n')
  .map((line) => line.match(/^ {10}- (tests\/[^ ]+\.test\.ts)\s*$/)?.[1])
  .filter((suite): suite is string => Boolean(suite));

it('keeps DB-free validation separate from isolated, sequential matrix services', () => {
  expect(verify).toContain('run: npm run test:unit');
  expect(verify).not.toMatch(/services:|RUN_DB_TESTS/);
  expect(integrations).toContain('needs: verify');
  expect(integrations).toContain('max-parallel: 1');
  expect(integrations).toContain('fail-fast: false');
  expect(integrations).toContain('    services:\n      mysql:');
  expect(integrations).not.toContain('continue-on-error');
});

it('runs every previously enabled MySQL suite exactly once, without parallel files', () => {
  const enabled = readdirSync('tests')
    .filter((name) => name.endsWith('.test.ts'))
    .filter((name) =>
      /process\.env\.RUN_DB_TESTS\s*(?:===|!==)\s*'true'/.test(
        readFileSync(`tests/${name}`, 'utf8'),
      ),
    )
    .map((name) => `tests/${name}`);
  expect(suites).toHaveLength(6);
  expect([...suites].sort()).toEqual(enabled.sort());
  expect(new Set(suites).size).toBe(suites.length);
  expect(integrations.match(/run: npx vitest run[^\n]+/g)).toEqual([
    'run: npx vitest run --no-file-parallelism --hookTimeout=30000 "${{ matrix.suite }}"',
  ]);
});

it('accredits the new service before its single suite and keeps protected names out of CI', () => {
  expect(integrations).toContain("service_id='${{ job.services.mysql.id }}'");
  expect(integrations.indexOf('CREATE TABLE prisma_test_disposable_marker')).toBeLessThan(
    integrations.indexOf('run: npx vitest'),
  );
  expect(integrations).toContain('MYSQL_DATABASE: prisma_disposable_ci');
  expect(integrations).toContain('DB_NAME: prisma_disposable_ci');
  expect(integrations).toContain('MYSQL_USER: prisma_ci');
  expect(integrations).toContain('DB_USER: prisma_ci');
  for (const name of ['prisma_dev', 'prisma_demo', 'prisma_test', 'prisma_qa_events_102_20261106'])
    expect(integrations).not.toMatch(new RegExp(`(?:DB_NAME|MYSQL_DATABASE): ${name}\\s`));
  for (const value of [
    'TEST_DB_SERVER_UUID=$server_uuid',
    'TEST_DB_DISPOSABLE_TOKEN=$token',
    'ALLOW_DESTRUCTIVE_DB_TESTS=destroy-disposable-only',
  ])
    expect(integrations).toContain(value);
});

it('keeps each migration baseline in its owning suite, with an explicit annual fixture', () => {
  const baselines = {
    'tests/integration.test.ts': 'await resetTestSchema()',
    'tests/identity-db.test.ts': "await migrate('016.sql')",
    'tests/identity-bindings-db.test.ts': "await migrate('018.sql')",
    'tests/oidc-db.test.ts': "await migrate('018.sql')",
    'tests/binding-b2-db.test.ts': "await migrate('019.sql')",
    'tests/statistics-annual-db.test.ts': 'await prepareAnnualFixture()',
  };
  for (const [file, baseline] of Object.entries(baselines))
    expect(readFileSync(file, 'utf8')).toContain(baseline);
  const annual = readFileSync('tests/statistics-annual-db.test.ts', 'utf8');
  expect(annual.indexOf('await prepareAnnualFixture()')).toBeLessThan(
    annual.indexOf('await pool.getConnection()'),
  );
  expect(annual).toContain('toHaveLength(2)');
});

it('documents the implemented isolation, command and all six baselines', () => {
  const documentation = readFileSync('docs/WORKFLOW.md', 'utf8');
  for (const suite of suites) expect(documentation).toContain(suite.replace('tests/', ''));
  expect(documentation).toContain('max-parallel: 1');
  expect(documentation).toContain('fail-fast: false');
  expect(documentation).toContain('servicio MySQL nuevo');
  expect(documentation).toContain(
    'npx vitest run --no-file-parallelism --hookTimeout=30000 "${{ matrix.suite }}"',
  );
  expect(documentation).not.toContain('npm test -- --exclude tests/identity-bindings-db.test.ts');
});
