import { z } from 'zod';

// MySQL BIGINT UNSIGNED travels as canonical decimal text, never Number.
export const portalCounter = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine((s) => BigInt(s) <= 18446744073709551615n);
export const portalContext = z
  .object({ userId: z.string().uuid(), sessionHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type PortalContext = z.infer<typeof portalContext>;
export type PortalActor = PortalContext;
export const portalMember = z
  .object({
    userId: z
      .string()
      .uuid()
      .transform((s) => s.toLowerCase()),
    instructorId: z.number().int().min(1).max(4294967295),
  })
  .strict();
export type PortalMember = z.infer<typeof portalMember>;
export interface PortalState {
  enabled: boolean;
  pilot_sealed: boolean;
  admissions_open: false;
  revision: string;
  security_seq: string;
  emergency_epoch: string;
}
export interface PortalLink {
  user_id: string;
  instructor_id: number;
  pilot_slot: number;
  status: 'enabled' | 'disabled';
  revision: string;
  min_login_seq: string;
}
export interface PortalResult {
  revision: string;
  securitySeq: string;
  emergencyEpoch: string;
  changed: boolean;
  linkRevision?: string;
}
export interface PortalReceipt {
  operationId: string;
  actorId: string;
  userId: string;
  event: string;
  details: {
    version: 1;
    scope: 'portal_global' | 'portal_identity';
    request: Record<string, unknown> & { actorId: string };
    beforeRevision: string;
    result: PortalResult;
    before: { state: PortalState; links: PortalLink[] };
    after: { state: PortalState; links: PortalLink[] };
  };
}
// The adapter owns a single transaction and acquires institution/policy locks first.
// All reads are current, all writes and audit commit together. No nested transactions.
export interface PortalTransaction {
  state(): Promise<PortalState>;
  authorize(context: PortalContext): Promise<PortalActor>;
  links(): Promise<PortalLink[]>;
  assertEligible(members: PortalMember[]): Promise<void>;
  saveState(state: PortalState): Promise<void>;
  insertLink(link: PortalLink): Promise<void>;
  saveLink(link: PortalLink): Promise<void>;
  revokePortalSessions(userId?: string): Promise<void>;
  receipt(operationId: string): Promise<PortalReceipt | undefined>;
  audit(receipt: PortalReceipt): Promise<void>;
}
export interface PortalLockScope {
  userIds?: string[];
  members?: PortalMember[];
}
export type PortalUnitOfWork = <T>(
  work: (tx: PortalTransaction) => Promise<T>,
  scope?: PortalLockScope,
) => Promise<T>;
