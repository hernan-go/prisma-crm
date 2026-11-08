import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const oidcFailure = () => new Error('OIDC operation unavailable.');
export const opaque = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const validOpaque = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

// Constructed only on explicit activation. Never reads environment or logs key material.
export function pkceVault(activeKeyId: string, keys: Readonly<Record<string, string>>) {
  const parsed = new Map<string, Buffer>();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(activeKeyId)) throw oidcFailure();
  for (const [id, encoded] of Object.entries(keys)) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || !/^[a-f0-9]{64}$/.test(encoded)) throw oidcFailure();
    parsed.set(id, Buffer.from(encoded, 'hex'));
  }
  if (!parsed.has(activeKeyId)) throw oidcFailure();
  return {
    seal(verifier: string, associatedData: string) {
      if (!validOpaque(verifier)) throw oidcFailure();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', parsed.get(activeKeyId)!, iv);
      cipher.setAAD(Buffer.from(associatedData));
      const ciphertext = Buffer.concat([cipher.update(verifier, 'utf8'), cipher.final()]);
      return {
        keyId: activeKeyId,
        encrypted: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url'),
      };
    },
    open(keyId: string, encrypted: string, associatedData: string) {
      try {
        const key = parsed.get(keyId);
        // 12-byte IV + 16-byte tag + 43-byte verifier, canonical base64url.
        const bytes = Buffer.from(encrypted, 'base64url');
        if (!key || bytes.length !== 71 || bytes.toString('base64url') !== encrypted)
          throw oidcFailure();
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(associatedData));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const verifier = Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString('utf8');
        if (!validOpaque(verifier)) throw oidcFailure();
        return verifier;
      } catch {
        throw oidcFailure();
      }
    },
  };
}
