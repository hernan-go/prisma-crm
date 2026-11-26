import { z } from 'zod';

export const receiptNumber = z.string().regex(/^[1-9][0-9]{0,19}$/);
export const receiptPreviewInput = z
  .object({
    paymentId: z.number().int().positive(),
    observation: z.string().trim().max(2000).default(''),
    replaces: receiptNumber.optional(),
  })
  .strict();
const operation = { operationId: z.string().uuid() };
export const receiptCommand = z.discriminatedUnion('kind', [
  receiptPreviewInput.extend({
    ...operation,
    kind: z.literal('issue'),
    previewToken: z.string().max(2048),
  }),
  z
    .object({
      ...operation,
      kind: z.literal('void'),
      receiptNumber,
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type ReceiptPreviewInput = z.infer<typeof receiptPreviewInput>;
export type ReceiptCommand = z.infer<typeof receiptCommand>;
export interface ReceiptSnapshot {
  version: 1;
  templateVersion: 'administrative-v1';
  resources: { profile: 'generic'; version: 'generic-v1'; manifestHash: string };
  personId: number;
  publicId: string;
  personName: string;
  paymentId: number;
  accountId: number;
  periodId: number;
  period: { year: number; month: number };
  paymentDate: string;
  amount: string;
  method: string;
  recipient: string;
  obligation: string | null;
  accumulated: string;
  balance: string | null;
  observation: string;
  activities: {
    enrollmentId: number;
    activityId: number;
    name: string;
    slots: { scheduleId: number | null; day: number; start: string; end: string }[];
  }[];
}
export interface PaymentReceipt {
  number: string;
  status: 'active' | 'void' | 'replaced';
  snapshot: ReceiptSnapshot;
  issuedAt: string;
  actorId: string;
  reason: string | null;
  endedAt: string | null;
  endedBy: string | null;
  replaces: string | null;
  replacedBy: string | null;
  reproduction: { available: boolean; reason?: 'missing' | 'corrupt' };
}
