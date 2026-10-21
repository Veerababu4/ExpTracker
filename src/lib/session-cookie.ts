// Shared by the proxy and the server session code (the proxy can't import server-only modules).
export const SESSION_COOKIE = "fe_session";
export const SESSION_DAYS = 30;

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
