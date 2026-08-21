import { NextRequest, NextResponse } from "next/server";
import { notifySlackError } from "@/lib/slack";
import {
  clientErrorRelayAllowedOrigin,
  consumeClientErrorRateLimit,
  parseClientErrorBody,
} from "./client-error-relay";

/** Same-origin client errors only. Stacks stay in Sentry, not this Slack relay. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!clientErrorRelayAllowedOrigin(origin, host)) {
    return new NextResponse(null, { status: 403 });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (!consumeClientErrorRateLimit(ip)) {
    return new NextResponse(null, { status: 429 });
  }

  const body = parseClientErrorBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });

  await notifySlackError({
    source: "admin (client)",
    title: body.title,
    fields: {
      path: body.path,
      digest: body.digest,
    },
  });

  return new NextResponse(null, { status: 204 });
}
