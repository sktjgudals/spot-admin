import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import UserDetailActions from "./UserDetailActions";

interface Props {
  params: Promise<{ userId: string }>;
}

function ageFrom(birthDate: Date | null): string {
  if (!birthDate) return "-";
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return `${age}세 (${birthDate.getFullYear()}년생)`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 break-words">{value || "-"}</span>
    </div>
  );
}

export default async function UserDetailPage({ params }: Props) {
  const { userId } = await params;

  const [user, businesses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        managedBusiness: { select: { id: true, name: true } },
        _count: {
          select: {
            applications: true,
            payments: true,
            wishlists: true,
            ratingsReceived: true,
          },
        },
      },
    }),
    prisma.business.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!user) notFound();

  const p = user.profile;
  const stats: { label: string; value: string | number }[] = [
    { label: "신청", value: user._count.applications },
    { label: "결제", value: user._count.payments },
    { label: "찜", value: user._count.wishlists },
    { label: "받은 평점 수", value: user._count.ratingsReceived },
    { label: "평균 평점", value: user.averageRating.toFixed(1) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          nativeButton={false}
          render={<Link href="/super-admin/users" />}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{user.nickname}</h1>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {user.role === "SUPER_ADMIN" ? (
          <Badge>슈퍼 어드민</Badge>
        ) : user.role === "ADMIN" ? (
          <Badge variant="secondary">
            업체 어드민{user.managedBusiness ? ` · ${user.managedBusiness.name}` : ""}
          </Badge>
        ) : (
          <Badge variant="outline">일반</Badge>
        )}
        {user.isBlocked ? (
          <Badge variant="destructive">정지</Badge>
        ) : (
          <Badge variant="secondary">정상</Badge>
        )}
        <Badge variant="outline">{user.provider}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 기본 정보 */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base">기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
            <Row label="가입일" value={user.createdAt.toLocaleString("ko-KR")} />
            <Row label="연락처" value={p?.phone} />
            <Row label="성별" value={p?.gender} />
            <Row label="나이" value={ageFrom(p?.birthDate ?? null)} />
            <Row label="지역" value={p?.city} />
            <Row label="직업" value={p?.occupation} />
            <Row label="직장" value={p?.company} />
            <Row label="학력" value={p?.education} />
            <Row label="MBTI" value={p?.mbti} />
            <Row label="인스타그램" value={p?.instagramId} />
            <Row
              label="키 / 몸무게"
              value={
                p?.height || p?.weight
                  ? `${p?.height ? `${p.height}cm` : "-"} / ${p?.weight ? `${p.weight}kg` : "-"}`
                  : null
              }
            />
            <Row label="흡연 / 음주" value={[p?.smokingStatus, p?.drinkingStatus].filter(Boolean).join(" / ") || null} />
            <Row label="결혼 여부" value={p?.maritalStatus} />
            <Row label="자기소개" value={p?.bio} />
            {user.isBlocked && (
              <Row label="정지 사유" value={user.blockReason} />
            )}
          </CardContent>
        </Card>

        {/* 활동 통계 + 액션 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base">활동</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
              <div className="grid grid-cols-3 gap-3">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-lg border p-3 text-center">
                    <div className="text-lg font-bold">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <UserDetailActions
            userId={user.id}
            nickname={user.nickname}
            role={user.role as "USER" | "ADMIN" | "SUPER_ADMIN"}
            isBlocked={user.isBlocked}
            currentBusinessId={user.businessId}
            businesses={businesses}
          />
        </div>
      </div>
    </div>
  );
}
