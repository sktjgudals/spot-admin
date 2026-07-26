import { NextRequest, NextResponse } from "next/server";

/**
 * Auth v2 only (PR3 — NextAuth removed).
 * - Nest refresh cookies: spot_admin_rt | spot_admin_sid | spot_admin_aid
 * - Full SUPER_ADMIN / BUSINESS shells restored at /super-admin/* and /business/*
 * - /app/* remains for Nest-first Business/Party migration paths
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasNestSession =
    !!req.cookies.get("spot_admin_rt")?.value ||
    !!req.cookies.get("spot_admin_sid")?.value;

  // Public auth pages (login, invite, signup/bootstrap, password reset)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset-password")
  ) {
    // 로그인·가입만 세션 있으면 홈으로. 비밀번호 찾기는 로그인 상태에서도 접근 가능.
    if (
      hasNestSession &&
      (pathname.startsWith("/login") || pathname.startsWith("/signup"))
    ) {
      // Client will refine by role; default to full SUPER_ADMIN chrome
      return NextResponse.redirect(new URL("/super-admin/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Root handled by client page; allow through
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Authenticated shells — client AuthGuard / RoleGuard enforce role
  if (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname.startsWith("/super-admin") ||
    pathname.startsWith("/business")
  ) {
    if (!hasNestSession) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
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
