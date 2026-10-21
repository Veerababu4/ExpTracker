import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { createSession, deleteSession, findSessionUser, type SessionUser } from "@/server/services/accounts";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie";

/** Logs the user in on this browser. Call only from a Server Action. */
export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(Math.round((expiresAt.getTime() - Date.now()) / 1000)));
}

/** Logs out this browser. Call only from a Server Action. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}

/** The logged-in user for this request, or null. Looked up once per request however often it's called. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Session checks compare against the current time, so they must run fresh on every request
  // (Cache Components would otherwise flag the clock read during prerendering).
  await connection();
  return token ? findSessionUser(token) : null;
});

/**
 * The logged-in user, or a redirect to /login. While a temporary password is in use, everything except
 * the first-login page redirects there.
 */
export async function requireUser(options: { allowTemporaryPassword?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowTemporaryPassword) redirect("/first-login");
  return user;
}
