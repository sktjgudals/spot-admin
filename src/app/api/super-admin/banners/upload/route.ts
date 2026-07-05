import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { requireRole } from "@/lib/api-auth";

const BUCKET = process.env.GCS_ASSETS_BUCKET ?? "dopa-assets";
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 배너 이미지를 공개 버킷(dopa-assets)에 업로드하고 공개 URL을 반환합니다. */
export async function POST(req: NextRequest) {
  const { error } = await requireRole("SUPER_ADMIN");
  if (error) return error;

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

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const objectPath = `banners/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const storage = new Storage();
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage.bucket(BUCKET).file(objectPath).save(buffer, {
    contentType: file.type,
    metadata: { cacheControl: "public, max-age=3600" },
  });

  return NextResponse.json({
    url: `https://storage.googleapis.com/${BUCKET}/${objectPath}`,
  });
}
