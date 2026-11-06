import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { pool, query, execute } from '../server/db';
import { migrate } from '../server/migrate';
import { createApp } from '../server/app';
import { memorySessions, testCredentials } from './auth-helper';
import { readEventEconomy } from '../server/event-economy';
const qa = 'prisma_qa_events_102_20261106';
const enabled = process.env.RUN_EVENT_MIGRATION_QA === 'true';
let agent: ReturnType<typeof request.agent>;
let period: number;
afterAll(() => pool.end());
describe.skipIf(!enabled)('Migraciones reales aisladas de Eventos', () => {
  beforeAll(async () => {
    if (process.env.DB_NAME !== qa || process.env.DB_HOST !== '127.0.0.1')
      throw Error('Solo QA explícita local');
    const [actual] = await query('SELECT DATABASE() db,CURRENT_USER() user,@@port port');
    expect(actual).toMatchObject({ db: qa, user: 'prisma_local@127.0.0.1', port: 3306 });
    expect(await query('SHOW TABLES')).toHaveLength(0);
    const credentials = await testCredentials();
    agent = request.agent(createApp({ ...credentials, store: memorySessions() }));
    expect(
      (await agent.post('/api/auth/login').send({ password: credentials.password })).status,
    ).toBe(200);
  });
  it('ejecuta 001–013 en orden; backend previo a Eventos sigue disponible', async () => {
    await migrate('013.sql');
    expect(await query('SELECT name FROM schema_migrations')).toHaveLength(13);
    period = (await execute('INSERT INTO periods(year,month) VALUES (2026,11)')).insertId;
    expect((await agent.get('/api/dashboard?period_id=' + period)).status).toBe(200);
    expect((await agent.get('/api/statistics/summary?period_id=' + period)).status).toBe(200);
    expect((await agent.get('/api/special-events?period_id=' + period)).status).toBe(503);
  });
  for (const migration of ['014.sql', '015.sql'])
    it(migration + ' rechaza cifras incompletas explícitamente', async () => {
      await migrate(migration);
      for (const path of [
        '/api/dashboard?period_id=',
        '/api/statistics/summary?period_id=',
        '/api/special-events?period_id=',
        '/api/periods/',
      ]) {
        if (path === '/api/periods/') continue;
        const response = await agent.get(path + period);
        expect(response.status).toBe(503);
        expect(response.body.message).toContain('incompleto');
      }
      const table = migration === '014.sql' ? 'special_events' : 'period_expenses';
      const rows = await query('SELECT COUNT(*) n FROM ' + table);
      await execute('DELETE FROM schema_migrations WHERE name=?', [migration]);
      try {
        await expect(migrate(migration)).rejects.toThrow('parcial');
        expect(await query('SELECT COUNT(*) n FROM ' + table)).toEqual(rows);
      } finally {
        await execute('INSERT INTO schema_migrations(name) VALUES (?)', [migration]);
      }
    });
  it('016 completa activación, replay y detección de parcial sin pérdida', async () => {
    await migrate('016.sql');
    await migrate('016.sql');
    expect(await query('SELECT name FROM schema_migrations')).toHaveLength(16);
    expect((await agent.get('/api/dashboard?period_id=' + period)).status).toBe(200);
    expect((await agent.get('/api/statistics/summary?period_id=' + period)).status).toBe(200);
    expect((await readEventEconomy(period, pool)).income.total).toBe('0.00');
    await execute("DELETE FROM schema_migrations WHERE name='016.sql'");
    try {
      await expect(migrate('016.sql')).rejects.toThrow('parcial');
    } finally {
      await execute("INSERT INTO schema_migrations(name) VALUES ('016.sql')");
    }
    await execute('DELETE FROM periods WHERE id=?', [period]);
  });
});
