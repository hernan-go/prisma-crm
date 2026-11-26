import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from './errors.js';

const claimsSchema = z
  .object({
    actor: z.string().min(1),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.number().int().positive(),
  })
  .strict();
type Claims = z.infer<typeof claimsSchema>;
function signingKey(key: string) {
  if (!/^[a-f0-9]{64,128}$/.test(key)) throw new AppError(503, 'Firma de preview no configurada.');
  return key;
}
export function receiptFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function signReceiptPreview(claims: Claims, key: string) {
  const payload = Buffer.from(JSON.stringify(claimsSchema.parse(claims))).toString('base64url');
  return payload + '.' + createHmac('sha256', signingKey(key)).update(payload).digest('base64url');
}
export function verifyReceiptPreview(
  token: string,
  actor: string,
  key: string,
  now = Date.now(),
): Claims {
  const secret = signingKey(key);
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    throw new AppError(409, 'Revisá nuevamente el recibo.');
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new AppError(409, 'Revisá nuevamente el recibo.');
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(409, 'Preview inválido.');
  }
  const result = claimsSchema.safeParse(decoded);
  if (!result.success || result.data.actor !== actor || result.data.expiresAt <= now)
    throw new AppError(409, 'El preview venció o pertenece a otra sesión administrativa.');
  return result.data;
}
