import { expect, it, vi } from 'vitest';
import { createPortalSessionService } from '../server/portal-sessions';
// Validation rejects ambiguous input before any persistence is acquired.
vi.mock('../server/portal-policy', () => ({
  withPortalDatabase: vi.fn(async () => {
    throw Error('must not connect');
  }),
}));
it('rejects duplicate and malformed credentials without connecting', async () => {
  const s = createPortalSessionService();
  await expect(s.logout({ portalTokens: ['a'.repeat(64), 'b'.repeat(64)] })).rejects.toMatchObject({
    status: 409,
  });
  await expect(s.logout({ portalTokens: ['invalid'] })).rejects.toMatchObject({ status: 401 });
});
