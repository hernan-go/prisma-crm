import { query, type Connection } from './db.js';
import { sessionDigest } from './identity.js';
import { AppError } from './errors.js';

// Deliberately independent from education_state and educational entitlements.
export async function authorizeReceipt(db: Connection, token: string) {
  const digest = sessionDigest(token);
  if (!digest) throw new AppError(403, 'Requiere sesión Google administrativa individual.');
  const rows = await query<{ actor: string }>(
    `SELECT s.user_id actor FROM identity_sessions s
     JOIN identity_users u ON u.id=s.user_id AND u.status='enabled'
     JOIN identity_user_roles r ON r.user_id=u.id AND r.role='admin'
     JOIN identity_external_accounts g ON g.user_id=u.id AND g.provider='google'
     JOIN identity_institution i ON i.id=1 AND i.initialized=1 AND (i.admin_one=u.id OR i.admin_two=u.id)
     WHERE s.token_hash=? AND s.application='crm' AND s.revoked_at IS NULL
     AND s.expires_at>CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) FOR UPDATE`,
    [digest],
    db,
  );
  if (rows.length !== 1)
    throw new AppError(403, 'Requiere sesión Google administrativa individual.');
  return rows[0].actor;
}
export async function receiptSchema(db: Connection, required = true) {
  const rows = await query<{ name: string }>(
    "SELECT name FROM schema_migrations WHERE name='024.sql'",
    [],
    db,
  );
  if (rows.length) return true;
  const partial = await query<{ name: string }>(
    "SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('payment_receipts','payment_receipt_operations')",
    [],
    db,
  );
  if (required || partial.length)
    throw new AppError(503, 'Recibos no disponibles: verificar migración 024.');
  return false;
}
