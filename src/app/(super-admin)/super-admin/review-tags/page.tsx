import { prisma } from "@/lib/prisma";
import ReviewTagManager from "./ReviewTagManager";

export default async function ReviewTagsPage() {
  const [categories, tags] = await Promise.all([
    prisma.praiseTagCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.praiseTag.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">리뷰 태그 관리</h1>
        <p className="text-sm text-muted-foreground">
          파티 종료 후 참가자들이 서로에게 남기는 <b>칭찬 태그</b>를 관리합니다.
          카테고리는 자유롭게 추가·이름변경할 수 있고, 카테고리 이름이 앱 리뷰
          화면의 섹션 제목으로 그대로 노출됩니다.
        </p>
      </div>

      <ReviewTagManager
        initialCategories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
        }))}
        initialTags={tags.map((t) => ({
          id: t.id,
          categoryId: t.categoryId,
          label: t.label,
          sortOrder: t.sortOrder,
          isActive: t.isActive,
        }))}
      />
    </div>
  );
}
