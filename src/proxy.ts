import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const publicPaths = ["/login", "/invite"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    if (token) {
      const role = token.role as string;
      const redirect =
        role === "SUPER_ADMIN" ? "/super-admin/dashboard" : "/business/dashboard";
      return NextResponse.redirect(new URL(redirect, req.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = token.role as string;

  if (pathname.startsWith("/super-admin") && role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/business/dashboard", req.url));
  }

  if (pathname.startsWith("/business") && role !== "BUSINESS") {
    return NextResponse.redirect(new URL("/super-admin/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
