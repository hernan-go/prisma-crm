import { expect, it } from 'vitest';
import { normalizeWhatsAppPhone, membershipPhone } from '../client/whatsapp-phone';
it.each([
  ['3410000000', '5493410000000'],
  ['03410000000', '5493410000000'],
  ['+54 9 341 000-0000', '5493410000000'],
  ['0054 341 0000000', '5493410000000'],
  ['(0341) 15 0000000', '5493410000000'],
  ['011 15 00000000', '5491100000000'],
  ['+598 90000000', '59890000000'],
  ['+1 202 000 0000', '12020000000'],
  ['', null],
  ['150000000', null],
  ['341150000000', null],
  ['0000000000', null],
  ['3410000000 / 3410000001', null],
  ['3410000000 ext 2', null],
  [undefined, null],
])('normalizes %s conservatively', (input, output) =>
  expect(normalizeWhatsAppPhone(input)).toBe(output),
);
it('joins only one matching personal ID and fails closed', () => {
  const rows = [{ id: 2, telefono: '3410000000', emergency_phone: '3410000001' }];
  expect(membershipPhone(rows, 2)).toBe('3410000000');
  expect(membershipPhone(rows, 1)).toBeUndefined();
  expect(membershipPhone([...rows, ...rows], 2)).toBeUndefined();
  expect(membershipPhone(undefined, 2)).toBeUndefined();
});
