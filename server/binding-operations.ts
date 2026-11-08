// Server-only composition. Browser code never receives an operator capability.
import { z } from 'zod';
import { execute, query } from './db.js';
import { identityMutation } from './identity-policy.js';
import {
  createBindingService,
  candidateFingerprint,
  type BindingAuthority,
} from './identity-bindings.js';
import { mysqlOidcStore, type EvidenceReference } from './oidc-store.js';
import { digest, oidcFailure } from './oidc-crypto.js';
const uuid = z.string().uuid();
const clock = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED)';

export async function bindingPreflight(expectedDatabase: string) {
  if (!expectedDatabase || !/^[a-zA-Z0-9_]+$/.test(expectedDatabase)) throw oidcFailure();
  const [target] = await query<{ name: string }>('SELECT DATABASE() name');
  if (target.name !== expectedDatabase) throw oidcFailure();
  const migrations = await query(
    "SELECT name FROM schema_migrations WHERE name IN ('017.sql','018.sql','019.sql')",
  );
  if (migrations.length !== 3) throw oidcFailure();
  await query('SELECT admin_one,admin_two,initialized FROM identity_institution WHERE id=1').then(
    (rows) => {
      if (rows.length !== 1) throw oidcFailure();
    },
  );
  await query('SELECT id,status,display_name FROM identity_users LIMIT 0');
  await query('SELECT provider,subject,user_id FROM identity_external_accounts LIMIT 0');
  await query('SELECT user_id,role FROM identity_user_roles LIMIT 0');
  await query(
    'SELECT token_hash,user_id,application,created_at,expires_at,revoked_at FROM identity_sessions LIMIT 0',
  );
  await query('SELECT id,user_id,actor_id,event,created_at FROM identity_audit_events LIMIT 0');
  await query(
    'SELECT id,user_id,code_hash,subject,expected_subject,expires_at,consumed_at,revoked_at FROM identity_binding_operations LIMIT 0',
  );
  await query(
    'SELECT id,configuration_hash,browser_hash,state_hash,status,nonce,pkce_encrypted FROM identity_oidc_attempts LIMIT 0',
  );
  return { database: target.name };
}
const store = mysqlOidcStore();
const verifyCandidate: BindingAuthority['verifyCandidate'] = async (
  evidence,
  binding,
  connection,
) => {
  const ref = evidence as EvidenceReference;
  if (
    !ref ||
    ref.context?.purpose !== 'binding' ||
    ref.context.userId !== binding.userId ||
    ref.context.operationId !== binding.operationId
  )
    throw oidcFailure();
  const proof = await store.consumeEvidence(connection, ref);
  return { provider: 'google', subject: proof.subject };
};
export function browserBindings() {
  return createBindingService({
    authorize: async () => {
      throw oidcFailure();
    },
    verifyCandidate,
  });
}
export async function bindingContext(operationId: string, code: string) {
  uuid.parse(operationId);
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(code);
  const [op] = await query<{ user_id: string }>(
    `SELECT o.user_id FROM identity_binding_operations o
    JOIN identity_institution i ON i.id=1 AND (o.user_id=i.admin_one OR o.user_id=i.admin_two)
    WHERE o.id=? AND o.code_hash=? AND o.subject IS NULL AND o.consumed_at IS NULL AND o.revoked_at IS NULL AND o.expires_at>${clock}`,
    [operationId, digest(code)],
  );
  if (!op) throw oidcFailure();
  return { purpose: 'binding' as const, userId: op.user_id, operationId };
}
export async function bindingAttempt(id: string, browserToken: string, state?: string) {
  uuid.parse(id);
  z.string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(browserToken);
  const [row] = await query<{ user_id: string; binding_operation_id: string; status: string }>(
    `SELECT user_id,binding_operation_id,status FROM identity_oidc_attempts
    WHERE id=? AND browser_hash=? AND purpose='binding' AND application='crm' AND provider='google'
    ${state === undefined ? '' : 'AND state_hash=?'}`,
    [id, digest(browserToken), ...(state === undefined ? [] : [digest(state)])],
  );
  if (!row) throw oidcFailure();
  return {
    context: {
      purpose: 'binding' as const,
      userId: row.user_id,
      operationId: row.binding_operation_id,
    },
    status: row.status,
  };
}
let maintenance: Promise<void> | undefined;
export function bindingMaintenance(): Promise<void> {
  if (maintenance) return maintenance;
  maintenance = (async () => {
    await store.cleanup();
    // Preserve operations and audit. Only close expired outstanding authorizations.
    await identityMutation(async (connection) => {
      const expired = await query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM identity_binding_operations
      WHERE consumed_at IS NULL AND revoked_at IS NULL AND expires_at<=${clock} FOR UPDATE`,
        [],
        connection,
      );
      for (const op of expired) {
        await execute(
          `UPDATE identity_binding_operations SET revoked_at=${clock} WHERE id=?`,
          [op.id],
          connection,
        );
        await execute(
          "INSERT INTO identity_audit_events(user_id,actor_id,event) VALUES (?,NULL,'binding.expired')",
          [op.user_id],
          connection,
        );
      }
    });
  })().finally(() => {
    maintenance = undefined;
  });
  return maintenance;
}
export function operatorBindings(expectedDatabase: string) {
  const capability = Symbol('local operator');
  const service = createBindingService({
    authorize: async (context) => {
      if (context !== capability) throw oidcFailure();
      return { kind: 'operator' };
    },
    verifyCandidate,
  });
  const checked = async () => bindingPreflight(expectedDatabase);
  return {
    preflight: checked,
    async prepare(ids: [string, string]) {
      await checked();
      await service.configure(capability, ids, true);
    },
    async configure(ids: [string, string]) {
      await checked();
      await service.configure(capability, ids);
    },
    async issue(userId: string, purpose: 'initial' | 'replace') {
      await checked();
      return service.issue(capability, userId, purpose);
    },
    async inspect(operationId: string, userId: string) {
      await checked();
      uuid.parse(operationId);
      uuid.parse(userId);
      const [op] = await query<{ subject: string; expires_at: number }>(
        `SELECT subject,expires_at FROM identity_binding_operations
        WHERE id=? AND user_id=? AND subject IS NOT NULL AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>${clock}`,
        [operationId, userId],
      );
      if (!op) throw oidcFailure();
      return {
        operationId,
        userId,
        expiresAt: Number(op.expires_at),
        fingerprint: candidateFingerprint(operationId, userId, op.subject),
      };
    },
    async approve(operationId: string, userId: string, fingerprint: string) {
      await checked();
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(fingerprint);
      await service.approve(capability, operationId, userId, fingerprint);
    },
    async revoke(operationId: string, userId: string) {
      await checked();
      await service.revoke(capability, operationId, userId);
    },
    async status() {
      await checked();
      return query(`SELECT i.initialized,i.admin_one,i.admin_two,u.id,u.display_name,u.status,
        EXISTS(SELECT 1 FROM identity_external_accounts e WHERE e.user_id=u.id AND e.provider='google') AS google_bound
        FROM identity_institution i LEFT JOIN identity_users u ON u.id=i.admin_one OR u.id=i.admin_two WHERE i.id=1`);
    },
    async maintain() {
      await checked();
      await bindingMaintenance();
    },
  };
}
