export type PortalSession =
  | { authenticated: false; csrf: string }
  | {
      authenticated: true;
      identity: { displayName: string; context: 'facilitator' };
      expiresAt: number;
    };
export type PortalState =
  | { kind: 'anonymous'; csrf: string }
  | {
      kind: 'authenticated';
      identity: { displayName: string; context: 'facilitator' };
      expiresAt: number;
    }
  | {
      kind:
        | 'loading'
        | 'expired'
        | 'conflict'
        | 'unavailable'
        | 'denied'
        | 'error'
        | 'attempt'
        | 'rateLimited';
    };
