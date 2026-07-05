import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

const TARGET_TYPES = ["ALL", "USERS", "PARTY_PARTICIPANTS", "PARTY_WISHLISTERS"] as const;
const CATEGORIES = ["MARKETING", "SYSTEM"] as const;

/** 타겟 푸시 발송 — spot-backend 내부 API로 프록시 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const apiKey = process.env.BACKEND_INTERNAL_API_KEY;
  if (!backendUrl || !apiKey) {
    return NextResponse.json(
      { message: "BACKEND_INTERNAL_URL / BACKEND_INTERNAL_API_KEY 환경변수가 필요합니다." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "INVALID_BODY" }, { status: 400 });

  const { targetType, userIds, partyId, title, body: pushBody, clickAction, category } = body;

  if (!TARGET_TYPES.includes(targetType)) {
    return NextResponse.json({ message: "INVALID_TARGET_TYPE" }, { status: 400 });
  }
  if (category && !CATEGORIES.includes(category)) {
    return NextResponse.json({ message: "INVALID_CATEGORY" }, { status: 400 });
  }
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 100) {
    return NextResponse.json({ message: "INVALID_TITLE" }, { status: 400 });
  }
  if (typeof pushBody !== "string" || pushBody.trim().length === 0 || pushBody.length > 500) {
    return NextResponse.json({ message: "INVALID_BODY_TEXT" }, { status: 400 });
  }

  const res = await fetch(`${backendUrl}/internal/notifications/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": apiKey,
    },
    body: JSON.stringify({
      targetType,
      ...(userIds ? { userIds } : {}),
      ...(partyId ? { partyId } : {}),
      title: title.trim(),
      body: pushBody.trim(),
      ...(clickAction ? { clickAction } : {}),
      ...(category ? { category } : {}),
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!res) {
    return NextResponse.json(
      { message: "spot-backend에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요." },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { message: data?.message ?? "발송 실패", detail: data },
      { status: res.status }
    );
  }

  return NextResponse.json(data);
}
