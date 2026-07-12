import { NextRequest } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { proxyBackendInternal } from "@/lib/backend-internal";

/** 슈퍼어드민 — 파티 이미지 R2 presigned PUT URL */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.contentType || typeof body.sizeBytes !== "number") {
    return Response.json({ message: "contentType과 sizeBytes가 필요합니다" }, { status: 400 });
  }

  return proxyBackendInternal("/internal/media/presign", {
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
  });
}
