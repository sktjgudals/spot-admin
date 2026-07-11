import { prisma } from "@/lib/prisma";
import ReviewTagManager from "./ReviewTagManager";

export default async function ReviewTagsPage() {
  const tags = await prisma.praiseTag.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">리뷰 태그 관리</h1>
        <p className="text-sm text-muted-foreground">
          파티 종료 후 참가자들이 서로에게 남기는 <b>칭찬 태그</b>를 관리합니다.
          문구(라벨)와 카테고리(대화·분위기·매너)는 언제든 변경할 수 있고, 앱
          리뷰 화면과 마이페이지 파티점수 집계에 즉시 반영됩니다.
        </p>
      </div>

      <ReviewTagManager
        initialTags={tags.map((t) => ({
          id: t.id,
          category: t.category,
          label: t.label,
          sortOrder: t.sortOrder,
          isActive: t.isActive,
        }))}
      />
    </div>
  );
}
