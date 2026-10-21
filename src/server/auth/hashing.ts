import { hash, verify } from "@node-rs/argon2";

// Argon2id with the OWASP-recommended minimum settings (19 MiB memory, 2 passes).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** Hashes a password or a (normalised) security answer. */
export function hashSecret(secret: string): Promise<string> {
  return hash(secret, OPTIONS);
}

export async function verifySecret(storedHash: string, secret: string): Promise<boolean> {
  try {
    return await verify(storedHash, secret);
  } catch {
    return false; // malformed hash
  }
}

let dummyHash: Promise<string> | undefined;

/** Spends the same time as a real check, so "no such user" and "wrong password" can't be told apart by timing. */
export async function verifyAgainstDummy(secret: string): Promise<void> {
  dummyHash ??= hashSecret("dummy-password-for-timing");
  await verifySecret(await dummyHash, secret);
}
