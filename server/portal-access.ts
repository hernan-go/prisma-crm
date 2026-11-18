// Internal only. No default instance, HTTP consumer, real account activation or sessions issued.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from './errors.js';
import {
  portalContext,
  portalCounter,
  portalMember,
  type PortalContext,
  type PortalLink,
  type PortalMember,
  type PortalReceipt,
  type PortalResult,
  type PortalState,
  type PortalTransaction,
  type PortalUnitOfWork,
} from '../shared/portal.js';

const uuid = z
  .string()
  .uuid()
  .transform((s) => s.toLowerCase());
const baseInput = z.object({ operationId: uuid, expectedRevision: portalCounter });
const linkInput = baseInput.extend({ userId: uuid, expectedLinkRevision: portalCounter });
const planSchema = z
  .object({
    version: z.literal(1),
    actorId: uuid,
    sessionBinding: z.string().regex(/^[a-f0-9]{64}$/),
    revision: portalCounter,
    members: z.array(portalMember).length(2),
    expiresAt: z.number().int().nonnegative().safe(),
  })
  .strict();
type Plan = z.infer<typeof planSchema>;
export interface PreparedPilot {
  plan: Plan;
  signature: string;
}
const fail = (message = 'Conflicto de política portal.') => new AppError(409, message);
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
// Only typed, bounded JSON payloads constructed here. Object key order is canonical.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function increment(value: string) {
  return portalCounter.parse((BigInt(portalCounter.parse(value)) + 1n).toString());
}
function normalizeMembers(input: PortalMember[]) {
  const members = z
    .array(portalMember)
    .length(2)
    .parse(input)
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  if (
    members[0].userId === members[1].userId ||
    members[0].instructorId === members[1].instructorId
  )
    throw fail('Se requieren dos identidades y dos instructores distintos.');
  return members;
}
function next(state: PortalState) {
  state.revision = increment(state.revision);
  state.security_seq = increment(state.security_seq);
}
function result(state: PortalState, changed: boolean, link?: PortalLink): PortalResult {
  return {
    revision: state.revision,
    securitySeq: state.security_seq,
    emergencyEpoch: state.emergency_epoch,
    changed,
    ...(link ? { linkRevision: link.revision } : {}),
  };
}
export function validatePortalLoginContext(
  state: PortalState,
  link: PortalLink,
  attempt: { begin_seq: string; emergency_epoch: string },
) {
  const seq = BigInt(portalCounter.parse(attempt.begin_seq));
  if (
    !state.enabled ||
    !state.pilot_sealed ||
    state.admissions_open ||
    link.status !== 'enabled' ||
    seq < BigInt(portalCounter.parse(link.min_login_seq)) ||
    seq > BigInt(portalCounter.parse(state.security_seq)) ||
    portalCounter.parse(attempt.emergency_epoch) !== portalCounter.parse(state.emergency_epoch)
  )
    throw new AppError(403, 'Contexto portal revocado o no habilitado.');
}

export function createPortalAccessService(
  run: PortalUnitOfWork,
  preparationKey: Uint8Array,
  now = Date.now,
) {
  if (preparationKey.byteLength < 32)
    throw new Error('Portal preparation key requires at least 32 bytes.');
  const key = Buffer.from(preparationKey);
  const sign = (plan: Plan) =>
    createHmac('sha256', key)
      .update('prisma-portal-pilot-v1\0' + canonical(plan))
      .digest('hex');
  async function operation(
    context: PortalContext,
    operationId: string,
    expectedRevision: string,
    action: string,
    params: Record<string, unknown>,
    effect: (tx: PortalTransaction, state: PortalState) => Promise<PortalResult>,
    userId?: string,
    members?: PortalMember[],
  ) {
    const c = portalContext.parse(context),
      id = uuid.parse(operationId);
    portalCounter.parse(expectedRevision);
    return run(
      async (tx) => {
        const actor = await tx.authorize(c),
          state = await tx.state();
        const request = {
          action,
          actorId: actor.userId.toLowerCase(),
          sessionBinding: digest(actor.sessionHash),
          expectedRevision,
          params,
        };
        const previous = await tx.receipt(id);
        if (previous) {
          if (
            previous.details.version !== 1 ||
            previous.actorId !== actor.userId ||
            canonical(previous.details.request) !== canonical(request)
          )
            throw fail('operation_id reutilizado con otro contenido.');
          return previous.details.result;
        }
        if (state.revision !== expectedRevision) throw fail('Revisión portal obsoleta.');
        const beforeRevision = state.revision;
        const before = structuredClone({ state, links: await tx.links() });
        const outcome = await effect(tx, state);
        await tx.saveState(state);
        const after = structuredClone({ state, links: await tx.links() });
        const receipt: PortalReceipt = {
          operationId: id,
          actorId: actor.userId,
          userId: userId ?? actor.userId,
          event: action,
          details: {
            version: 1,
            scope: userId ? 'portal_identity' : 'portal_global',
            request,
            beforeRevision,
            before,
            after,
            result: outcome,
          },
        };
        await tx.audit(receipt);
        return outcome;
      },
      { userIds: [c.userId, ...(userId ? [userId] : [])], members },
    );
  }
  async function linkMutation(
    context: PortalContext,
    raw: z.infer<typeof linkInput> & { enabled?: boolean },
    sessionsOnly: boolean,
  ) {
    // Session revocation preserves link eligibility; withdrawing access uses
    // setLinkEnabled(false). Both advance the individual authorization barrier.
    const input = sessionsOnly
      ? linkInput.strict().parse(raw)
      : linkInput.extend({ enabled: z.boolean() }).strict().parse(raw);
    return operation(
      context,
      input.operationId,
      input.expectedRevision,
      sessionsOnly ? 'portal.sessions.revoked' : 'portal.link.status',
      {
        userId: input.userId,
        expectedLinkRevision: input.expectedLinkRevision,
        ...('enabled' in input ? { enabled: input.enabled } : {}),
      },
      async (tx, state) => {
        if (!state.pilot_sealed) throw fail('Piloto no sellado.');
        const link = (await tx.links()).find((l) => l.user_id === input.userId);
        if (!link || link.revision !== input.expectedLinkRevision)
          throw fail('Vínculo inexistente o revisión obsoleta.');
        const status = 'enabled' in input && input.enabled ? 'enabled' : 'disabled';
        if (!sessionsOnly && link.status === status) return result(state, false, link);
        if (!sessionsOnly && status === 'enabled')
          await tx.assertEligible([{ userId: link.user_id, instructorId: link.instructor_id }]);
        next(state);
        link.revision = increment(link.revision);
        link.min_login_seq = state.security_seq;
        if (!sessionsOnly) link.status = status;
        await tx.saveLink(link);
        await tx.revokePortalSessions(link.user_id);
        return result(state, true, link);
      },
      input.userId,
    );
  }
  return {
    async preparePilot(context: PortalContext, input: PortalMember[]): Promise<PreparedPilot> {
      const c = portalContext.parse(context),
        members = normalizeMembers(input);
      return run(
        async (tx) => {
          const actor = await tx.authorize(c),
            state = await tx.state();
          if (
            state.pilot_sealed ||
            (await tx.links()).length ||
            state.enabled ||
            state.admissions_open
          )
            throw fail('Preparación cerrada.');
          await tx.assertEligible(members);
          const plan: Plan = {
            version: 1,
            actorId: actor.userId,
            sessionBinding: digest(actor.sessionHash),
            revision: state.revision,
            members,
            expiresAt: now() + 300000,
          };
          return { plan, signature: sign(plan) };
        },
        { userIds: [c.userId], members },
      );
    },
    async sealPilot(context: PortalContext, operationId: string, prepared: PreparedPilot) {
      const p = planSchema.parse(prepared.plan),
        c = portalContext.parse(context);
      const members = normalizeMembers(p.members);
      const signature = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(prepared.signature);
      if (
        !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(p), 'hex')) ||
        p.actorId !== c.userId ||
        p.sessionBinding !== digest(c.sessionHash)
      )
        throw fail('Preparación inválida.');
      return operation(
        c,
        operationId,
        p.revision,
        'portal.pilot.sealed',
        { plan: p },
        async (tx, state) => {
          if (
            now() >= p.expiresAt ||
            state.pilot_sealed ||
            state.enabled ||
            state.admissions_open ||
            (await tx.links()).length
          )
            throw fail('Preparación vencida o piloto ya sellado.');
          await tx.assertEligible(members);
          next(state);
          state.pilot_sealed = true;
          for (const [index, m] of members.entries())
            await tx.insertLink({
              user_id: m.userId,
              instructor_id: m.instructorId,
              pilot_slot: index + 1,
              status: 'enabled',
              revision: '1',
              min_login_seq: state.security_seq,
            });
          return result(state, true);
        },
        undefined,
        members,
      );
    },
    setLinkEnabled: (
      context: PortalContext,
      input: z.infer<typeof linkInput> & { enabled: boolean },
    ) => linkMutation(context, input, false),
    revokePortalSessions: (context: PortalContext, input: z.infer<typeof linkInput>) =>
      linkMutation(context, input, true),
    async setPortalEnabled(
      context: PortalContext,
      raw: z.infer<typeof baseInput> & { enabled: boolean },
    ) {
      const input = baseInput.extend({ enabled: z.boolean() }).strict().parse(raw);
      return operation(
        context,
        input.operationId,
        input.expectedRevision,
        'portal.global.status',
        { enabled: input.enabled },
        async (tx, state) => {
          if (state.enabled === input.enabled) return result(state, false);
          if (input.enabled) {
            const links = await tx.links();
            if (!state.pilot_sealed || state.admissions_open || links.length !== 2)
              throw fail('Piloto incompleto.');
            await tx.assertEligible(
              links
                .filter((l) => l.status === 'enabled')
                .map((l) => ({ userId: l.user_id, instructorId: l.instructor_id })),
            );
          }
          next(state);
          state.enabled = input.enabled;
          if (!input.enabled) {
            state.emergency_epoch = increment(state.emergency_epoch);
            await tx.revokePortalSessions();
          }
          return result(state, true);
        },
      );
    },
    // Future OIDC consumer must call within its own emission transaction. This
    // standalone check cannot authorize a later transaction or HTTP request.
    async validateLogin(userId: string, attempt: { begin_seq: string; emergency_epoch: string }) {
      const id = uuid.parse(userId);
      return run(
        async (tx) => {
          const state = await tx.state(),
            link = (await tx.links()).find((l) => l.user_id === id);
          if (!link) throw new AppError(403, 'Identidad fuera del piloto.');
          validatePortalLoginContext(state, link, attempt);
          await tx.assertEligible([{ userId: link.user_id, instructorId: link.instructor_id }]);
          return { userId: id, instructorId: link.instructor_id };
        },
        { userIds: [id] },
      );
    },
  };
}
