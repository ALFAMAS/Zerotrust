/** Documented example / all-zero hex secrets that must never ship in production. */
export const DOCUMENTED_PLACEHOLDER_SECRETS = new Set([
  "0".repeat(64),
  "a".repeat(64),
  "b".repeat(64),
  "c".repeat(64),
  "f".repeat(64),
]);

export function isPlaceholderSecretHex(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (DOCUMENTED_PLACEHOLDER_SECRETS.has(normalized)) return true;
  // Reject any all-same-nibble 64-char hex (e.g. docker-compose placeholders).
  return /^([0-9a-f])\1{63}$/.test(normalized);
}
