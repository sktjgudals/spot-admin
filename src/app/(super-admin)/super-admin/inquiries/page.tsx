import { prisma } from "@/lib/prisma";
import InquiryList from "./InquiryList";

export default async function InquiriesPage() {
  const inquiries = await prisma.inquiry.findMany({
    orderBy: [{ isResolved: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: { user: { select: { nickname: true, email: true } } },
  });

  const openCount = inquiries.filter((i) => !i.isResolved).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">문의 관리</h1>
        <p className="text-sm text-muted-foreground">
          앱 마이페이지 &gt; 문의하기로 접수된 1:1 문의입니다. 미처리{" "}
          <b>{openCount}</b>건.
        </p>
      </div>

      <InquiryList
        initialItems={inquiries.map((i) => ({
          id: i.id,
          nickname: i.user.nickname,
          email: i.user.email,
          message: i.message,
          contact: i.contact,
          isResolved: i.isResolved,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
