import { prisma } from "@/lib/prisma";
import CategoryManager from "./CategoryManager";

export default async function CategoriesPage() {
  const categories = await prisma.partyCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { parties: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">파티 카테고리 관리</h1>
        <p className="text-sm text-muted-foreground">
          파티 등록 시 선택하는 카테고리를 관리합니다. <b>메인 노출(FIXED)</b>
          상태인 카테고리는 앱 홈 상단 메인 카테고리로 노출되고, 탭하면 해당
          유형 필터가 걸린 검색 화면으로 이동합니다.
        </p>
      </div>

      <CategoryManager
        initialCategories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          partyCount: c._count.parties,
        }))}
      />
    </div>
  );
}
