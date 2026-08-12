import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware retained intentionally for Cloudflare OpenNext.
 * Next.js 16 Proxy is Node-only, while OpenNext currently requires Edge
 * middleware for request interception.
 *
 * Auth v2 cookies: spot_admin_rt | spot_admin_sid | spot_admin_aid
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
      (pathname.startsWith("/login") || pathname.startsWith("/signup"))
    ) {
      return NextResponse.redirect(new URL("/super-admin/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/") return NextResponse.next();

  if (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/business")
  ) {
    if (!hasSession) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // App Router emits `/icon.png`, while `public/` also serves the sidebar
  // logo and other immutable assets.  Let every file-like path bypass auth;
  // otherwise a signed-out browser receives `/login` instead of a favicon.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
