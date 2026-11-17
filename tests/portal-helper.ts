import type {
  PortalActor,
  PortalContext,
  PortalLink,
  PortalMember,
  PortalReceipt,
  PortalState,
  PortalTransaction,
  PortalUnitOfWork,
} from '../shared/portal';

export const actorId = '00000000-0000-4000-8000-000000000001';
export const userA = '00000000-0000-4000-8000-000000000002';
export const userB = '00000000-0000-4000-8000-000000000003';
export const userC = '00000000-0000-4000-8000-000000000004';
export const context: PortalContext = { userId: actorId, sessionHash: 'a'.repeat(64) };
export const members: PortalMember[] = [
  { userId: userA, instructorId: 1 },
  { userId: userB, instructorId: 2 },
];

// Behavioral transaction double, not evidence of MySQL locking or DDL correctness.
export function memoryPortal() {
  const initial: PortalState = {
    enabled: false,
    pilot_sealed: false,
    admissions_open: false,
    revision: '0',
    security_seq: '0',
    emergency_epoch: '0',
  };
  let data = {
    state: initial,
    links: [] as PortalLink[],
    receipts: [] as PortalReceipt[],
    sessions: [
      { userId: userA, application: 'portal', revoked: false },
      { userId: userB, application: 'portal', revoked: false },
      { userId: userB, application: 'crm', revoked: false },
    ],
  };
  let queue = Promise.resolve();
  const eligible = new Set([userA + ':1', userB + ':2', userC + ':3']);
  const controls = { failAudit: false, authorized: true };
  const actors = new Map([[context.sessionHash, actorId]]);
  const run: PortalUnitOfWork = async <T>(work: (tx: PortalTransaction) => Promise<T>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const draft = structuredClone(data);
    const tx: PortalTransaction = {
      state: async () => draft.state,
      authorize: async (c): Promise<PortalActor> => {
        if (!controls.authorized || actors.get(c.sessionHash) !== c.userId)
          throw new Error('Unauthorized');
        return { userId: c.userId, sessionHash: c.sessionHash };
      },
      links: async () => draft.links,
      assertEligible: async (items) => {
        if (items.some((m) => !eligible.has(m.userId + ':' + m.instructorId)))
          throw new Error('Ineligible');
      },
      saveState: async (s) => {
        draft.state = structuredClone(s);
      },
      insertLink: async (link) => {
        if (
          draft.links.some(
            (l) =>
              l.user_id === link.user_id ||
              l.instructor_id === link.instructor_id ||
              l.pilot_slot === link.pilot_slot,
          )
        )
          throw new Error('Duplicate');
        draft.links.push(structuredClone(link));
      },
      saveLink: async (link) => {
        draft.links = draft.links.map((l) =>
          l.user_id === link.user_id ? structuredClone(link) : l,
        );
      },
      revokePortalSessions: async (userId) => {
        for (const s of draft.sessions)
          if (s.application === 'portal' && (!userId || s.userId === userId)) s.revoked = true;
      },
      receipt: async (id) => draft.receipts.find((r) => r.operationId === id),
      audit: async (r) => {
        if (controls.failAudit) throw new Error('Audit failure');
        draft.receipts.push(structuredClone(r));
      },
    };
    try {
      const result = await work(tx);
      data = structuredClone(draft);
      return result;
    } finally {
      release();
    }
  };
  return {
    run,
    controls,
    eligible,
    actors,
    snapshot: () => structuredClone(data),
    setState: (state: Partial<PortalState>) => {
      Object.assign(data.state, state);
    },
  };
}
