import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { portalMember, type PortalUnitOfWork, type PortalContext } from '../shared/portal.js';
import { query, transaction, type Connection } from './db.js';
import { identityMutation, lockInstitution } from './identity-policy.js';
import { setIdentityRoleInTransaction } from './identity.js';
import { createPortalAccessService } from './portal-access.js';
import { withPortalDatabase } from './portal-policy.js';

export function parseTarget(args: string[], env = process.env) {
  const [host, port, database, uuid] = z
    .tuple([
      z.string().min(1),
      z.string().regex(/^[1-9]\d{0,4}$/),
      z.string().min(1),
      z.string().uuid(),
    ])
    .parse(args);
  if (
    env.DB_HOST !== host ||
    env.DB_PORT !== port ||
    env.DB_NAME !== database ||
    !env.DB_USER ||
    Number(port) > 65535
  )
    throw Error('Destino de conexión no coincide.');
  return { host, port, database, uuid };
}
type Target = ReturnType<typeof parseTarget>;
export async function verifyTarget(db: Connection, target: Target) {
  const [r] = await query('SELECT DATABASE() db, @@port port, @@server_uuid uuid', [], db);
  if (r.db !== target.database || String(r.port) !== target.port || r.uuid !== target.uuid)
    throw Error('Instancia o esquema inesperado.');
  const migration = await query("SELECT name FROM schema_migrations WHERE name='021.sql'", [], db);
  if (!migration.length) throw Error('Se requiere migración 021.');
}
export const expectedMember = portalMember
  .extend({ subject: z.string().regex(/^[!-~]{1,255}$/) })
  .strict();
type Member = z.infer<typeof expectedMember>;
async function institutionalMember(db: Connection, input: Member) {
  const member = expectedMember.parse(input);
  const institution = await lockInstitution(db);
  if (
    !institution?.initialized ||
    !institution.admin_one ||
    !institution.admin_two ||
    institution.admin_one === institution.admin_two ||
    ![institution.admin_one, institution.admin_two].includes(member.userId)
  )
    throw Error('Administrador institucional ambiguo o incorrecto.');
  const [user] = await query(
    'SELECT status FROM identity_users WHERE id=? FOR UPDATE',
    [member.userId],
    db,
  );
  const roles = (
    await query(
      'SELECT role FROM identity_user_roles WHERE user_id=? ORDER BY role FOR UPDATE',
      [member.userId],
      db,
    )
  ).map((r) => String(r.role));
  const google = await query(
    "SELECT subject FROM identity_external_accounts WHERE user_id=? AND provider='google' FOR UPDATE",
    [member.userId],
    db,
  );
  const [instructor] = await query(
    'SELECT active FROM instructors WHERE id=? FOR UPDATE',
    [member.instructorId],
    db,
  );
  if (
    user?.status !== 'enabled' ||
    !roles.includes('admin') ||
    google.length !== 1 ||
    google[0].subject !== member.subject ||
    !instructor?.active
  )
    throw Error('Identidad, vínculo Google o instructor incorrecto.');
  return { roles, admins: [institution.admin_one, institution.admin_two] };
}
export async function previewGrant(target: Target, raw: Member) {
  const member = expectedMember.parse(raw);
  async function inspect(db: Connection) {
    await verifyTarget(db, target);
    await lockInstitution(db);
    const [state] = await query(
      'SELECT enabled,pilot_sealed,admissions_open,CAST(revision AS CHAR) revision FROM portal_access_state WHERE id=1 FOR UPDATE',
      [],
      db,
    );
    const links = await query(
      'SELECT user_id FROM identity_instructor_links ORDER BY user_id FOR UPDATE',
      [],
      db,
    );
    if (!state || state.enabled || state.pilot_sealed || state.admissions_open || links.length)
      throw Error('Se requiere piloto vacío y cerrado.');
    const identity = await institutionalMember(db, member);
    return { ...identity, revision: state.revision };
  }
  const snapshot = await transaction(inspect);
  const phrase =
    'CONCEDER facilitator ' + target.database + ' ' + member.userId + ' ' + member.instructorId;
  return {
    userId: member.userId,
    instructorId: member.instructorId,
    roles: [...snapshot.roles],
    phrase,
    async apply(confirmation: string) {
      if (confirmation !== phrase) throw Error('Confirmación incorrecta.');
      return identityMutation(async (db) => {
        if (!isDeepStrictEqual(snapshot, await inspect(db))) throw Error('Preview obsoleto.');
        await setIdentityRoleInTransaction(db, member.userId, 'facilitator', true, null);
        return { changed: !snapshot.roles.includes('facilitator') };
      });
    },
  };
}
export function pilotOperator(target: Target, key: Uint8Array, expected: Member[] = []) {
  const members = z.array(expectedMember).parse(expected);
  function unitOfWork(enabling = false): PortalUnitOfWork {
    return (work, scope) =>
      withPortalDatabase(async (db, tx) => {
        await verifyTarget(db, target);
        return work({
          ...tx,
          assertEligible: async (pairs) => {
            if (enabling) {
              const links = await tx.links();
              if (members.length !== 2 || links.length !== 2)
                throw Error('Se requieren ambos cupos sellados.');
              for (const link of links) {
                const confirmed = members.find(
                  (m) => m.userId === link.user_id && m.instructorId === link.instructor_id,
                );
                if (!confirmed) throw Error('Cupo sellado incorrecto.');
                const identity = await institutionalMember(db, confirmed);
                if (!identity.roles.includes('facilitator')) throw Error('Falta rol facilitator.');
              }
            }
            await tx.assertEligible(pairs);
            if (pairs.length === 2 && members.length !== 2)
              throw Error('Se requieren ambos pares verificados.');
            for (const pair of pairs) {
              const member = members.find(
                (m) => m.userId === pair.userId && m.instructorId === pair.instructorId,
              );
              if (!member) throw Error('Par no confirmado.');
              await institutionalMember(db, member);
            }
          },
        });
      }, scope);
  }
  const run = unitOfWork();
  const access = createPortalAccessService(run, key);
  return {
    ...access,
    setPortalEnabled(context: PortalContext, input: Parameters<typeof access.setPortalEnabled>[1]) {
      return (
        input.enabled ? createPortalAccessService(unitOfWork(true), key) : access
      ).setPortalEnabled(context, input);
    },
    status: (context: PortalContext) =>
      run(
        async (tx) => {
          await tx.authorize(context);
          return { state: await tx.state(), links: await tx.links() };
        },
        { userIds: [context.userId] },
      ),
  };
}
