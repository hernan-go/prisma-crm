import { query, execute, peopleTransaction, type Connection } from './db.js';
import { openPeriod } from './scheduling.js';
import { AppError, requireFound } from './errors.js';

export async function requireMembership(person: number, period: number, db: Connection) {
  const [membership] = await query(
    'SELECT id FROM period_memberships WHERE person_id=? AND period_id=? FOR UPDATE',
    [person, period],
    db,
  );
  if (!membership) throw new AppError(409, 'Agregá primero la persona al período seleccionado.');
  return membership;
}

// Used by explicit incorporation and confirmed period imports, never global person creation.
export async function membershipInDB(
  person: number,
  period: number,
  db: Connection,
  allowExisting = false,
) {
  await openPeriod(period, db);
  const [existing] = await query(
    'SELECT id FROM period_memberships WHERE person_id=? AND period_id=? FOR UPDATE',
    [person, period],
    db,
  );
  if (existing && allowExisting) return existing;
  const [p] = await query('SELECT activo FROM people WHERE id=? FOR UPDATE', [person], db);
  requireFound(p);
  if (!p.activo) throw new AppError(409, 'Una persona archivada no puede incorporarse al período.');
  if (existing) throw new AppError(409, 'La persona ya está incorporada a este período.');
  return {
    id: (
      await execute(
        'INSERT INTO period_memberships(person_id,period_id) VALUES (?,?)',
        [person, period],
        db,
      )
    ).insertId,
  };
}

export const membershipAdd = (person: number, period: number) =>
  peopleTransaction((db) => membershipInDB(person, period, db));

export async function membershipList(period: number, person?: number) {
  requireFound((await query('SELECT id FROM periods WHERE id=?', [period]))[0]);
  return query(
    `SELECT m.id membership_id,m.created_at membership_created_at,p.*,
      (SELECT GROUP_CONCAT(o.name ORDER BY o.name SEPARATOR ' · ')
       FROM enrollments e JOIN period_activities o ON o.period_id=e.period_id AND o.activity_id=e.activity_id
       WHERE e.person_id=m.person_id AND e.period_id=m.period_id) activities
     FROM period_memberships m JOIN people p ON p.id=m.person_id
     WHERE m.period_id=? ${person ? 'AND m.person_id=?' : ''} ORDER BY p.apellido,p.nombre,p.id`,
    person ? [period, person] : [period],
  );
}

export async function membershipRemove(membership: number, period: number) {
  return peopleTransaction(async (db) => {
    await openPeriod(period, db);
    const [m] = await query(
      'SELECT * FROM period_memberships WHERE id=? AND period_id=? FOR UPDATE',
      [membership, period],
      db,
    );
    requireFound(m);
    const blockedMessage =
      'No se puede quitar del período: tiene inscripciones, pagos o un importe a cobrar definido que deben conservarse.';
    const [related] = await query(
      'SELECT COUNT(*) enrollments FROM enrollments WHERE person_id=? AND period_id=?',
      [m.person_id, period],
      db,
    );
    if (Number(related.enrollments)) throw new AppError(409, blockedMessage);
    const [account] = await query(
      'SELECT id,amount_due FROM monthly_accounts WHERE person_id=? AND period_id=? FOR UPDATE',
      [m.person_id, period],
      db,
    );
    if (account) {
      const [payment] = await query(
        'SELECT id FROM payments WHERE account_id=? LIMIT 1 FOR UPDATE',
        [account.id],
        db,
      );
      if (payment || account.amount_due !== null) throw new AppError(409, blockedMessage);
      await execute('DELETE FROM monthly_accounts WHERE id=?', [account.id], db);
    }
    await execute(
      'DELETE FROM period_memberships WHERE id=? AND period_id=?',
      [membership, period],
      db,
    );
    return { ok: true };
  });
}
