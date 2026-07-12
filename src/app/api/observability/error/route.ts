import { NextRequest, NextResponse } from "next/server";
import { notifySlackError } from "@/lib/slack";

/** 브라우저(클라이언트)에서 잡힌 오류를 Slack([admin (client)])으로 전달한다. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });

  await notifySlackError({
    source: "admin (client)",
    title: String(body.title ?? "브라우저 오류").slice(0, 200),
    detail: typeof body.detail === "string" ? body.detail : undefined,
    fields: {
      path: typeof body.path === "string" ? body.path : undefined,
      digest: typeof body.digest === "string" ? body.digest : undefined,
    },
  });

  return new NextResponse(null, { status: 204 });
}
