import { expect, it } from 'vitest';
import {
  facilitatorPending,
  facilitatorAccountSchema,
  facilitatorPaymentSchema,
} from '../shared/facilitators.js';
it('calcula pendiente decimal sin crédito y conserva indefinido', () => {
  expect(facilitatorPending(null, '5')).toBeNull();
  expect(facilitatorPending('0', '0')).toBe('0.00');
  expect(facilitatorPending('0.30', '0.10')).toBe('0.20');
  expect(facilitatorPending('1', '2')).toBe('0.00');
});
it('valida cuentas y pagos sin medio y permite fechas de otro mes', () => {
  expect(
    facilitatorAccountSchema.parse({ offering_id: 1, instructor_id: 2, amount_due: null })
      .amount_due,
  ).toBeNull();
  expect(facilitatorPaymentSchema.safeParse({ date: '2026-10-03', amount: '1.01' }).success).toBe(
    true,
  );
  expect(facilitatorPaymentSchema.safeParse({ date: '2026-10-03', amount: '0' }).success).toBe(
    false,
  );
});
