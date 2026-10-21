// Family join codes (DESIGN F2): 8 characters shown as XXXX-XXXX. No look-alike characters (0/O, 1/I/L),
// so a code read out over the phone can't be mistyped into another valid one.

export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;

/** "abcd-2345", " ABCD 2345 " → "ABCD2345". */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isJoinCode(code: string): boolean {
  return code.length === JOIN_CODE_LENGTH && [...code].every((c) => JOIN_CODE_ALPHABET.includes(c));
}

/** "ABCD2345" → "ABCD-2345" */
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
