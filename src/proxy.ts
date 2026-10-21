import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, sessionCookieOptions } from "@/lib/session-cookie";

// Runs before every page request. It never touches the database (Next.js advice): it only pushes the
// session cookie's expiry forward, so an active user stays logged in. Pages still check the session
// properly on the server; an expired or fake cookie gets them nothing.
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // GET only: Server Actions (login, logout…) are POSTs and set or delete the cookie themselves.
  if (token && request.method === "GET") {
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_DAYS * 86_400));
  }
  return response;
}

export const config = {
  // Pages only: skip static files, images and the health check.
  matcher: ["/((?!_next/static|_next/image|api/health|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
