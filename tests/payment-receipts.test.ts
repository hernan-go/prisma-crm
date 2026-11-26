import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { signReceiptPreview, verifyReceiptPreview } from '../server/receipt-preview';
import { receiptPreviewInput, receiptCommand } from '../shared/payment-receipts';
import { genericReceiptResources, receiptResourceAvailability } from '../server/receipt-resources';

describe('receipt preview integrity', () => {
  const key = randomBytes(32).toString('hex');
  const claims = { actor: 'admin', fingerprint: 'a'.repeat(64), expiresAt: 2000 };
  it('binds actor, source fingerprint and expiration without trusting client fields', () => {
    const token = signReceiptPreview(claims, key);
    expect(verifyReceiptPreview(token, 'admin', key, 1000)).toEqual(claims);
    expect(() => verifyReceiptPreview(token, 'other', key, 1000)).toThrow();
    expect(() => verifyReceiptPreview(token, 'admin', key, 2000)).toThrow();
    expect(() => verifyReceiptPreview(token + 'x', 'admin', key, 1000)).toThrow();
    expect(() =>
      verifyReceiptPreview(token, 'admin', randomBytes(32).toString('hex'), 1000),
    ).toThrow();
    expect(() => signReceiptPreview(claims, '')).toThrow();
  });
  it('rejects oversized, malformed tokens and forged public observation fields', () => {
    for (const token of ['', 'x'.repeat(5000), 'e30.bad', 'a.b.c'])
      expect(() => verifyReceiptPreview(token, 'admin', key, 1000)).toThrow();
    expect(receiptPreviewInput.safeParse({ paymentId: 1, amount: '1.00' }).success).toBe(false);
    expect(
      receiptPreviewInput.safeParse({ paymentId: 1, observation: 'x'.repeat(2001) }).success,
    ).toBe(false);
    expect(receiptCommand.safeParse({ kind: 'void', receiptNumber: '1', reason: '' }).success).toBe(
      false,
    );
  });
  it('reports unavailable historical resources without silently replacing their version', () => {
    expect(receiptResourceAvailability(genericReceiptResources)).toEqual({ available: true });
    expect(
      receiptResourceAvailability({ ...genericReceiptResources, version: 'missing-v0' }),
    ).toEqual({ available: false, reason: 'missing' });
    expect(
      receiptResourceAvailability(genericReceiptResources, () => Buffer.from('corrupt')),
    ).toEqual({ available: false, reason: 'corrupt' });
  });
});
