import { createHash, createHmac, randomBytes } from "node:crypto";

/** New random session token for the cookie (32 bytes). */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores instead of the token: a stolen database copy can't be used to log in. */
export function sessionIdFor(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Stable keyed hash, e.g. to pick the same "decoy" questions for an unknown username every time. */
export function keyedHash(value: string): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", secret).update(value).digest();
}
