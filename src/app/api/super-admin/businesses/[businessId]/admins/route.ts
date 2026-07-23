/**
 * @deprecated
 * Temporary Auth v2-compatible BFF.
 * Owner: Admin Platform
 * Replacement: Nest /admin/v2/... (see docs/LEGACY_BFF_INVENTORY.md)
 * Removal target: 2026-10 (or earlier per inventory)
 * UI: legacy pages redirected; do not add new callers.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

interface Params {
  params: Promise<{ businessId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  const admins = await prisma.adminAccount.findMany({
    where: { businessId, role: "BUSINESS" },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(admins);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const { businessId } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.name || !body?.password) {
    return NextResponse.json(
      { message: "email, name, password는 필수입니다" },
      { status: 400 },
    );
  }

  const email = String(body.email).trim().toLowerCase();
  const name = String(body.name).trim();
  const password = String(body.password);
  if (!email || !name) {
    return NextResponse.json({ message: "email/name이 비어 있습니다" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { message: "비밀번호는 8자 이상이어야 합니다" },
      { status: 400 },
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!business) {
    return NextResponse.json({ message: "NOT_FOUND" }, { status: 404 });
  }

  const existing = await prisma.adminAccount.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { message: "이미 등록된 어드민 이메일입니다" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.adminAccount.create({
    data: {
      email,
      name,
      passwordHash,
      role: "BUSINESS",
      businessId,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(admin, { status: 201 });
}
