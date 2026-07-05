/**
 * admin.dopa.ing → Cloud Run(dopa-admin) 프록시 Worker
 *
 * 사용 이유: 서울 리전 Cloud Run은 도메인 매핑 미지원, Firebase Hosting은
 * __session 외 쿠키를 제거해 NextAuth 세션이 깨짐, GCP LB는 월 ~$18.
 * Cloudflare Worker는 무료 플랜(10만 req/일)으로 쿠키를 그대로 통과시킨다.
 *
 * 설정 (Cloudflare 대시보드):
 * 1. Workers & Pages → Create Worker → 이름 dopa-admin-proxy → 이 코드 붙여넣기 → Deploy
 * 2. Worker → Settings → Domains & Routes → Add → Custom Domain → admin.dopa.ing
 *    (DNS 레코드·인증서는 Cloudflare가 자동 생성)
 */

const ORIGIN = "dopa-admin-407436072297.asia-northeast3.run.app";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const publicHost = url.hostname;
    url.hostname = ORIGIN;

    // Next.js/NextAuth가 리다이렉트·쿠키 URL을 공개 도메인 기준으로 만들도록 전달
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", publicHost);
    headers.set("X-Forwarded-Proto", "https");

    const resp = await fetch(new Request(url, request), { headers });

    // 원본 호스트가 노출된 Location 헤더는 공개 도메인으로 치환
    const loc = resp.headers.get("Location");
    if (loc && loc.includes(ORIGIN)) {
      const fixed = new Response(resp.body, resp);
      fixed.headers.set("Location", loc.replaceAll(ORIGIN, publicHost));
      return fixed;
    }
    return resp;
  },
};
