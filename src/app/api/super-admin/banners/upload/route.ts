import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * 배너 이미지를 spot-backend `/internal/media/upload` → R2(media.dopa.ing)로 올린다.
 * GCS 직접 업로드는 쓰지 않는다.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const apiKey = process.env.BACKEND_INTERNAL_API_KEY;
  if (!backendUrl || !apiKey) {
    return NextResponse.json(
      { message: "BACKEND_INTERNAL_URL / BACKEND_INTERNAL_API_KEY 환경변수가 필요합니다." },
      { status: 500 },
    );
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ message: "파일이 필요합니다" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ message: "jpeg/png/webp만 허용됩니다" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ message: "10MB 이하만 허용됩니다" }, { status: 400 });
  }

  const forward = new FormData();
  forward.append("file", file);
  forward.append("prefix", "banners");

  const res = await fetch(`${backendUrl}/internal/media/upload`, {
    method: "POST",
    headers: { "x-internal-api-key": apiKey },
    body: forward,
    cache: "no-store",
  }).catch(() => null);

  if (!res) {
    return NextResponse.json(
      { message: "spot-backend에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요." },
      { status: 502 },
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { message: data?.message ?? "업로드에 실패했습니다", detail: data },
      { status: res.status },
    );
  }
  return NextResponse.json({ url: data.url });
}
