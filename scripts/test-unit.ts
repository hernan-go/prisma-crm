import { spawnSync } from 'node:child_process';

// Override inherited flags AND dotenv values; this process must never open MySQL.
const env: Record<string, string | undefined> = { ...process.env, ALLOW_DESTRUCTIVE_DB_TESTS: '' };
const flags = [
  'RUN_DB_TESTS',
  'RUN_AI_READ_DB_TESTS',
  'RUN_AI_KNOWLEDGE_DB_TESTS',
  'RUN_KNOWLEDGE_DB_TESTS',
  'RUN_KNOWLEDGE_PROPOSALS_DB_TESTS',
  'RUN_RECURRING_DB_TESTS',
  'RUN_RECURRING_PERIOD_DB_TESTS',
  'RUN_RECURRING_MIGRATION_REPLAY_TESTS',
  'RUN_RECURRING_REMOVAL_DB_TESTS',
  'RUN_STATISTICS_DB_TESTS',
  'RUN_EVENT_DB_TESTS',
  'RUN_EVENT_MIGRATION_QA',
];
for (const flag of flags) env[flag] = 'false';
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)],
  {
    env,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
