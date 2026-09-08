import type { Metadata } from "next";
import { publicGoogleClientId } from "@/auth/oidc/public-clients";
import { parseAnalyticsProperties } from "@/features/analytics/property-config";
import { UserDetailPage } from "@/features/users/UserDetailPage";

export const metadata: Metadata = {
  title: "사용자 상세",
};

/**
 * `/super-admin/users`는 그대로 `[section]/page.tsx`가 처리한다.
 * 여기에 `users/page.tsx`를 만들면 목록 라우트가 가려진다 — 만들지 말 것.
 *
 * `params` 타입은 `.next/types` 생성물에 의존하지 않도록 직접 적는다.
 */
export default async function SuperAdminUserDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const config = parseAnalyticsProperties(process.env.NEXT_PUBLIC_GA4_PROPERTIES);

  return (
    <UserDetailPage
      userId={id}
      analytics={{
        properties: config.ok ? config.properties : [],
        configError: config.ok ? null : config.message,
        googleClientId: publicGoogleClientId(),
      }}
    />
  );
}
