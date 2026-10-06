import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  expenseCategorySchema,
  expenseSchema,
  expenseSchemaForPeriod,
} from '../shared/expenses.js';

describe('Validación de categorías y gastos', () => {
  const valid = { concept: ' Insumos ', date: '2034-02-28', amount: '25.50' };
  it('recorta nombres y conceptos y admite comentario opcional', () => {
    expect(expenseCategorySchema.parse({ name: ' Alquiler ' })).toEqual({ name: 'Alquiler' });
    expect(expenseSchema.parse(valid)).toMatchObject({ concept: 'Insumos', notes: '' });
  });
  it('rechaza títulos vacíos o demasiado largos y campos ajenos al contrato', () => {
    for (const name of ['', '   ', 'a'.repeat(201)]) {
      expect(expenseCategorySchema.safeParse({ name }).success).toBe(false);
      expect(expenseSchema.safeParse({ ...valid, concept: name }).success).toBe(false);
    }
    expect(expenseCategorySchema.safeParse({ name: 'Otro', period_id: 1 }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...valid, category_id: 1 }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...valid, notes: 'a'.repeat(2001) }).success).toBe(false);
  });
  it.each(['0', '-1', 'NaN', '1.001', '10000000000', '', '1e3'])('rechaza monto %s', (amount) => {
    expect(expenseSchema.safeParse({ ...valid, amount }).success).toBe(false);
  });
  it.each(['', '2034-02-29', '2034-04-31', '28/02/2034'])('rechaza fecha %s', (date) => {
    expect(expenseSchema.safeParse({ ...valid, date }).success).toBe(false);
  });
  it('acepta centavos, límite DECIMAL y año bisiesto', () => {
    for (const amount of ['0.01', '9999999999.99'])
      expect(expenseSchema.safeParse({ ...valid, date: '2032-02-29', amount }).success).toBe(true);
  });
  it('007 no contiene escrituras sobre períodos ni cambios al archivo histórico', async () => {
    const sql = await readFile('server/migrations/007.sql', 'utf8');
    expect(sql).not.toMatch(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+periods\b/i);
    expect(sql).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+advertising_investments\b/i,
    );
  });
  it('el esquema usado por el formulario valida el período seleccionado, incluso histórico', () => {
    const schema = expenseSchemaForPeriod('2026-11');
    expect(schema.safeParse({ ...valid, date: '2026-11-07' }).success).toBe(true);
    for (const date of ['2026-10-07', '2020-05-07']) {
      const result = schema.safeParse({ ...valid, date });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: ['date'],
            message: 'La fecha del gasto debe pertenecer al período seleccionado.',
          }),
        );
    }
    expect(
      expenseSchemaForPeriod('2026-08').safeParse({ ...valid, date: '2026-08-15' }).success,
    ).toBe(true);
  });
});
