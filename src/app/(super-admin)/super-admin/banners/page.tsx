import { prisma } from "@/lib/prisma";
import BannerManager from "./BannerManager";

export default async function BannersPage() {
  const banners = await prisma.banner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">배너 관리</h1>
        <p className="text-sm text-muted-foreground">
          앱 홈 상단에 노출되는 메인 배너를 관리합니다. 활성 배너가 노출 순서대로
          표시됩니다. (권장 비율 16:9)
        </p>
      </div>

      <BannerManager
        initialBanners={banners.map((b) => ({
          id: b.id,
          title: b.title,
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
          isActive: b.isActive,
          sortOrder: b.sortOrder,
          createdAt: b.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
