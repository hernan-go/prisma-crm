import { describe, it, expect } from 'vitest';
import {
  prismaRecurringPreset,
  recurringConceptSchema,
  recurringSaveSchema,
  recurringLinkSchema,
  recurringAmountRemovalSchema,
  recurringRevisionSchema,
} from '../shared/recurring-expenses';
const expense = {
  concept: 'Alquiler',
  amount: '505000.00',
  date: '2026-12-10',
  notes: 'Comprobante',
};
describe('contratos de gastos recurrentes', () => {
  it('revisión decimal sin pérdida de precisión', () => {
    expect(recurringRevisionSchema.parse('9007199254740993')).toBe('9007199254740993');
    for (const value of [1, '', 'abc', '1.2', '01', '-1', '18446744073709551616'])
      expect(recurringRevisionSchema.safeParse(value).success).toBe(false);
  });
  it('preset explícito sin importes, con ocho conceptos e iconos válidos', () => {
    expect(prismaRecurringPreset).toHaveLength(8);
    expect(new Set(prismaRecurringPreset.map((c) => c.name)).size).toBe(8);
    prismaRecurringPreset.forEach((c) => expect(recurringConceptSchema.parse(c)).toEqual(c));
    expect(prismaRecurringPreset[7].name).toBe('Cobertura médica');
  });
  it('exige fecha explícita, importe positivo y rechaza marcadores de usuario', () => {
    expect(recurringSaveSchema.safeParse({ revision: '0', expense, expected: null }).success).toBe(
      true,
    );
    for (const patch of [{ date: '' }, { amount: '0' }, { amount: '-1' }, { recurring_single: 1 }])
      expect(
        recurringSaveSchema.safeParse({
          revision: '0',
          expense: { ...expense, ...patch },
          expected: null,
        }).success,
      ).toBe(false);
  });
  it('conserva cero histórico en la expectativa de concurrencia sin habilitar nuevas cargas cero', () => {
    expect(
      recurringSaveSchema.safeParse({
        revision: '0',
        expense,
        expected: { ...expense, id: 1, amount: '0.00' },
      }).success,
    ).toBe(true);
  });
  it('preserva espacios de conceptos y notas históricos al corregir solo el importe', () => {
    const original = { ...expense, concept: ' Alquiler histórico ', notes: ' Nota original\n' };
    const parsed = recurringSaveSchema.parse({
      revision: '0',
      expense: original,
      expected: { ...original, id: 1 },
    });
    expect(parsed.expense).toEqual(original);
    expect(parsed.expected?.notes).toBe(original.notes);
  });
  it('vínculos solamente por ID y catálogo con iconos seguros', () => {
    expect(recurringLinkSchema.safeParse({ name: 'Alquiler' }).success).toBe(false);
    expect(recurringLinkSchema.parse({ revision: '0', category_id: 2 })).toEqual({
      revision: '0',
      category_id: 2,
    });
    expect(
      recurringConceptSchema.safeParse({ ...prismaRecurringPreset[0], icon_name: '<svg>' }).success,
    ).toBe(false);
  });
  it('quitar importe requiere ID y monto exactos esperados', () => {
    expect(
      recurringAmountRemovalSchema.parse({
        revision: '0',
        expected: { ...expense, id: 7, amount: '525000.00' },
      }),
    ).toEqual({
      revision: '0',
      expected: { ...expense, id: 7, amount: '525000.00' },
    });
    expect(recurringAmountRemovalSchema.safeParse({ expected: { id: 7 } }).success).toBe(false);
    expect(
      recurringAmountRemovalSchema.safeParse({
        revision: '0',
        expected: { ...expense, id: 7, amount: '0' },
      }).success,
    ).toBe(true); // Un cero histórico válido también puede quitarse explícitamente.
    expect(
      recurringAmountRemovalSchema.safeParse({
        revision: '0',
        expected: { ...expense, id: 7, amount: '525000.00' },
        period_id: 2,
      }).success,
    ).toBe(false);
  });
});
