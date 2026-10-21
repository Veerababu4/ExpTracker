// Suggested temporary passwords for head-created logins: easy to read out (no look-alike characters) and
// always valid (10 characters, letters and digits). The member replaces it at first login.
const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

function pick(chars: string, random: Uint32Array, i: number) {
  return chars[random[i] % chars.length];
}

export function suggestTempPassword(): string {
  const random = new Uint32Array(10);
  crypto.getRandomValues(random);
  let out = "";
  for (let i = 0; i < 6; i++) out += pick(LETTERS, random, i);
  for (let i = 6; i < 10; i++) out += pick(DIGITS, random, i);
  return out;
}
