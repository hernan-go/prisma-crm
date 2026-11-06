import { describe, it, expect } from 'vitest';
import { eventSchemaReady } from '../server/event-schema';
import { hasEventExpenses } from '../server/event-expenses';
import { requireEventSchema } from '../server/special-events';
import { initialExpenseDate } from '../client/Expenses';
const db = (names: string[]) =>
  ({
    execute: async (sql: string) => {
      expect(sql).toContain('schema_migrations');
      return [names.map((name) => ({ name }))];
    },
  }) as any;
describe('Activación del esquema de Eventos', () => {
  it('013 conserva modo anterior y API de Eventos informa indisponibilidad', async () => {
    expect(await eventSchemaReady(db([]))).toBe(false);
    expect(await hasEventExpenses(db([]))).toBe(false);
    await expect(requireEventSchema(db([]))).rejects.toMatchObject({ status: 503 });
  });
  for (const names of [['014.sql'], ['014.sql', '015.sql'], ['016.sql'], ['014.sql', '016.sql']])
    it('rechaza estado intermedio ' + names.join(','), async () => {
      await expect(eventSchemaReady(db(names))).rejects.toMatchObject({ status: 503 });
      await expect(hasEventExpenses(db(names))).rejects.toMatchObject({ status: 503 });
      await expect(requireEventSchema(db(names))).rejects.toMatchObject({ status: 503 });
    });
  it('habilita solo con las tres migraciones', async () => {
    expect(await eventSchemaReady(db(['014.sql', '015.sql', '016.sql']))).toBe(true);
    await expect(
      requireEventSchema(db(['014.sql', '015.sql', '016.sql'])),
    ).resolves.toBeUndefined();
  });
});
describe('Fecha inicial de Gastos, regla anterior', () => {
  it('usa día argentino antes de medianoche y primer día en otro período', () => {
    const now = new Date('2026-12-01T02:59:59Z');
    expect(initialExpenseDate('2026-11', now)).toBe('2026-11-30');
    expect(initialExpenseDate('2026-12', now)).toBe('2026-12-01');
    expect(initialExpenseDate('2026-10', now)).toBe('2026-10-01');
  });
  it('cambia el día en medianoche argentina', () => {
    expect(initialExpenseDate('2026-12', new Date('2026-12-02T03:00:00Z'))).toBe('2026-12-02');
  });
});

it('Skeleton financiero representa cuatro KPI y las dos tarjetas de talleres', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { DashboardFinanceSkeleton } = await import('../client/DashboardSkeleton');
  const html = renderToStaticMarkup(createElement(DashboardFinanceSkeleton));
  expect(html.match(/class="stat loading-card"/g)).toHaveLength(4);
  expect(html).toContain('dashboard-stats');
  expect(html).not.toContain('dashboard-three-stats');
});
