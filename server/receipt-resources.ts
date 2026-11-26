import { createHash } from 'node:crypto';

// The generic profile has no institutional images or signatures. Its descriptor is
// versioned evidence, not an export renderer. Keep historical descriptors immutable.
const genericManifest = Buffer.from('{"profile":"generic","version":"generic-v1","files":[]}');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const genericReceiptResources = {
  profile: 'generic' as const,
  version: 'generic-v1' as const,
  manifestHash: hash(genericManifest),
};
export function receiptResourceAvailability(
  reference: { profile: string; version: string; manifestHash: string },
  load: (version: string) => Uint8Array | undefined = (version) =>
    version === 'generic-v1' ? genericManifest : undefined,
): { available: boolean; reason?: 'missing' | 'corrupt' } {
  const manifest = load(reference.version);
  if (!manifest) return { available: false, reason: 'missing' };
  if (reference.profile !== 'generic' || hash(manifest) !== reference.manifestHash)
    return { available: false, reason: 'corrupt' };
  return { available: true };
}
