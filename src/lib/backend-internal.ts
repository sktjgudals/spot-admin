import { NextResponse } from "next/server";

/**
 * spot-backend 내부 API(/internal/**)로 POST 프록시하는 공통 헬퍼.
 * BACKEND_INTERNAL_URL + x-internal-api-key(BACKEND_INTERNAL_API_KEY)로 인증한다.
 * 성공/실패 모두 NextResponse로 반환하므로 라우트에서 그대로 return하면 된다.
 */
export async function proxyBackendInternal(
  path: string,
  body?: unknown,
): Promise<NextResponse> {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const apiKey = process.env.BACKEND_INTERNAL_API_KEY;
  if (!backendUrl || !apiKey) {
    return NextResponse.json(
      { message: "BACKEND_INTERNAL_URL / BACKEND_INTERNAL_API_KEY 환경변수가 필요합니다." },
      { status: 500 },
    );
  }

  const res = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": apiKey,
    },
    body: JSON.stringify(body ?? {}),
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
      { message: data?.message ?? "요청에 실패했습니다", detail: data },
      { status: res.status },
    );
  }
  return NextResponse.json(data);
}
