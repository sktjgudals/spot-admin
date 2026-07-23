import { NextRequest, NextResponse } from "next/server";

/**
 * Auth v2 only (PR3 — NextAuth removed).
 * - Nest refresh cookies: spot_admin_rt | spot_admin_sid | spot_admin_aid
 * - Legacy /super-admin/* and /business/* → /app/*
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasNestSession =
    !!req.cookies.get("spot_admin_rt")?.value ||
    !!req.cookies.get("spot_admin_sid")?.value;

  // Auth v2 app shell
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return NextResponse.next();
  }

  // Legacy SUPER_ADMIN UI → Auth v2 businesses
  if (pathname.startsWith("/super-admin")) {
    return NextResponse.redirect(new URL("/app/businesses", req.url));
  }

  // Legacy BUSINESS UI → Auth v2 parties
  if (pathname.startsWith("/business")) {
    return NextResponse.redirect(new URL("/app/parties", req.url));
  }

  // Public auth pages
  if (pathname.startsWith("/login") || pathname.startsWith("/invite")) {
    if (hasNestSession && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/app", req.url));
    }
    return NextResponse.next();
  }

  // Root handled by client page; allow through
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Everything else: require Nest session cookie or send to login
  if (!hasNestSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
