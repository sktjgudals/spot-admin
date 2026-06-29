import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { AdminRole } from "@/generated/prisma";
import type { Session } from "next-auth";

type AuthSuccess = { session: Session; error: null };
type AuthError = { session: null; error: NextResponse };
type AuthResult = AuthSuccess | AuthError;

export async function requireRole(role: AdminRole): Promise<AuthResult> {
  const session = await auth();
  if (!session) {
    return { session: null, error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== role) {
    return { session: null, error: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

export async function requireAnyRole(): Promise<AuthResult> {
  const session = await auth();
  if (!session) {
    return { session: null, error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}
