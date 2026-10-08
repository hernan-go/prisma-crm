import { describe, expect, it } from 'vitest';
import { paymentSchema } from '../shared/domain.js';
import { formRowSchema } from '../shared/forms.js';
import { legacyReceiptHash } from '../server/forms-receipt-legacy.js';

const payment = {
  person_id: 1,
  period_id: 1,
  date: '2051-01-02',
  amount: '25',
  method: 'cash',
  recipient: 'jesica',
};
const legacyRow = {
  person: { nombre: 'Histórica', apellido: 'Sintética', telefono: '0000099001' },
  action: 'create',
  reviewed: true,
  selections: [],
  amount_due: '100',
  payment: { amount: '25', method: 'cash', date: '2051-01-02', include: true },
};
describe('Contrato de pagos y reconocimiento de receipts anteriores', () => {
  it.each([
    ['jesica', 'cash'],
    ['jesica', 'transfer'],
    ['hernan', 'cash'],
    ['hernan', 'transfer'],
  ])('valida %s / %s sin derivación', (recipient, method) => {
    expect(paymentSchema.parse({ ...payment, recipient, method })).toMatchObject({
      recipient,
      method,
    });
  });
  it.each([undefined, null, '', 'otro', 'JESICA'])(
    'rechaza receptor %j en alta e importación nueva',
    (recipient) => {
      expect(paymentSchema.safeParse({ ...payment, recipient }).success).toBe(false);
      expect(
        formRowSchema.safeParse({ ...legacyRow, payment: { ...legacyRow.payment, recipient } })
          .success,
      ).toBe(false);
    },
  );
  it('reproduce el hash pre-009 fijo y el orden de propiedades original', () => {
    expect(legacyReceiptHash(71, [legacyRow])).toBe(
      '640c55f33755ab675e4880a240e2cfdd55eed2e7e4cad7ea1d0145628ed03ea3',
    );
    const reordered = {
      ...legacyRow,
      payment: { include: true, date: '2051-01-02', method: 'cash', amount: '25' },
    };
    expect(legacyReceiptHash(71, [reordered])).toBe(
      '640c55f33755ab675e4880a240e2cfdd55eed2e7e4cad7ea1d0145628ed03ea3',
    );
    expect(legacyReceiptHash(72, [legacyRow])).not.toBe(legacyReceiptHash(71, [legacyRow]));
  });
  it('no elimina un receptor explícito ni acepta datos históricos inválidos', () => {
    expect(
      legacyReceiptHash(71, [
        { ...legacyRow, payment: { ...legacyRow.payment, recipient: 'jesica' } },
      ]),
    ).toBeUndefined();
    expect(
      legacyReceiptHash(71, [{ ...legacyRow, payment: { ...legacyRow.payment, recipient: '' } }]),
    ).toBeUndefined();
    expect(
      legacyReceiptHash(71, [{ ...legacyRow, payment: { ...legacyRow.payment, amount: '0' } }]),
    ).toBeUndefined();
    expect(legacyReceiptHash(71, [{ ...legacyRow, reviewed: false }])).toBeUndefined();
  });
  it('reconocimiento legacy nunca habilita el contrato de escritura nuevo', () => {
    expect(legacyReceiptHash(71, [legacyRow])).toBeTruthy();
    expect(formRowSchema.safeParse(legacyRow).success).toBe(false);
  });
});
