/** Conservative presentation-only conversion; never changes stored values. */
export function normalizeWhatsAppPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  const international = raw.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (international) {
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    if (!digits.startsWith('54')) return digits;
    if (/^549(?:11|[23]\d)\d{8}$/.test(digits)) return digits;
    if (/^54(?:11|[23]\d)\d{8}$/.test(digits)) return `549${digits.slice(2)}`;
    return null;
  }
  // Explicit separators identify the area boundary before the domestic mobile prefix.
  const mobile = raw.match(/^\(?0?([1-3]\d{1,3})\)?[\s.-]+15[\s.-]+(\d[\d\s.-]*)$/);
  if (mobile) {
    const national = mobile[1] + mobile[2].replace(/\D/g, '');
    return /^(?:11|[23]\d)\d{8}$/.test(national) ? `549${national}` : null;
  }
  if (/^549(?:11|[23]\d)\d{8}$/.test(digits)) return digits;
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^(?:11|[23]\d)\d{8}$/.test(digits) ? `549${digits}` : null;
}

export function membershipPhone(rows: unknown, personId: unknown): string | undefined {
  if (!Array.isArray(rows) || !Number.isSafeInteger(personId) || Number(personId) <= 0) return;
  const matches = rows.filter((row) => row && row.id === personId);
  if (matches.length !== 1 || typeof matches[0].telefono !== 'string') return;
  return matches[0].telefono;
}
