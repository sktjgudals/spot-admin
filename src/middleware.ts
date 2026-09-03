import { NextRequest, NextResponse } from "next/server";
import { RUNTIME_SECURITY_HEADERS } from "@/lib/security-headers";

function withSecurityHeaders(response: NextResponse) {
  for (const [name, value] of Object.entries(RUNTIME_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * Edge middleware retained intentionally for Cloudflare OpenNext.
 * Next.js 16 Proxy is Node-only, while OpenNext currently requires Edge
 * middleware for request interception.
 *
 * Admin session cookies: spot_admin_rt | spot_admin_sid | spot_admin_aid
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The client sets this when its own session check came back unauthenticated.
  // A cookie the API refused is still a cookie, so without this the two layers
  // disagree forever: /login bounces to /app, /app fails to refresh and asks
  // for /login again, and the operator only ever sees the redirect screen.
  const signedOut = req.nextUrl.searchParams.get("signedOut") === "1";

  const hasSession =
    !!req.cookies.get("spot_admin_rt")?.value ||
    !!req.cookies.get("spot_admin_sid")?.value;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset-password")
  ) {
    if (
      hasSession &&
      !signedOut &&
      (pathname.startsWith("/login") || pathname.startsWith("/signup"))
    ) {
      return withSecurityHeaders(NextResponse.redirect(new URL("/app", req.url)));
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (pathname === "/") return withSecurityHeaders(NextResponse.next());

  if (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname.startsWith("/super-admin")
  ) {
    if (!hasSession) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL("/login", req.url)),
      );
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (!hasSession) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/login", req.url)),
    );
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  // App Router emits `/icon.png`, while `public/` also serves the sidebar
  // logo and other immutable assets.  Let every file-like path bypass auth;
  // otherwise a signed-out browser receives `/login` instead of a favicon.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
