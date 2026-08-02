import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

/**
 * 카카오 로컬 키워드 검색 프록시 (업체 어드민 파티 등록).
 * REST API 키는 서버 env 만 사용 — 브라우저에 노출 금지.
 * 반드시 BUSINESS/SUPER_ADMIN Bearer (requireRole) — 공개 남용 차단.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireRole("BUSINESS");
  if (error) return error;

  const query = req.nextUrl.searchParams.get("query")?.trim() ?? "";
  if (query.length < 1) {
    return NextResponse.json({ message: "PLACE_QUERY_REQUIRED" }, { status: 400 });
  }
  if (query.length > 100) {
    return NextResponse.json({ message: "PLACE_QUERY_TOO_LONG" }, { status: 400 });
  }

  const key =
    process.env.KAKAO_REST_API_KEY?.trim() ||
    process.env.KAKAO_CLIENT_ID?.trim() ||
    "";
  if (!key) {
    return NextResponse.json(
      { message: "KAKAO_PLACE_SEARCH_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "12");

  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { message: "KAKAO_PLACE_SEARCH_FAILED" },
        { status: 503 },
      );
    }
    const data = (await res.json()) as {
      documents?: Array<{
        id: string;
        place_name: string;
        address_name: string;
        road_address_name?: string;
        x: string;
        y: string;
        category_name?: string;
      }>;
    };

    const items = (data.documents ?? []).map((doc) => {
      const road = doc.road_address_name?.trim() || null;
      const jibun = doc.address_name?.trim() || "";
      const address = road || jibun;
      const parts = address.split(/\s+/).filter(Boolean);
      const locationLabel =
        parts.length <= 1 ? address || doc.place_name : parts.slice(0, 2).join(" ");
      return {
        id: doc.id,
        placeName: doc.place_name,
        address,
        roadAddress: road,
        locationLabel,
        latitude: Number(doc.y),
        longitude: Number(doc.x),
        categoryName: doc.category_name ?? null,
      };
    });

    return NextResponse.json(items);
  } catch {
    return NextResponse.json(
      { message: "KAKAO_PLACE_SEARCH_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
