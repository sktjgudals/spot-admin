import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Pencil } from "lucide-react";
import StartPartyButton from "@/components/start-party-button";
import ClosePartyButton from "@/components/close-party-button";

interface Props {
  params: Promise<{ id: string }>;
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 break-words">{value ?? "-"}</span>
    </div>
  );
}

export default async function SuperAdminPartyDetailPage({ params }: Props) {
  const { id } = await params;

  const party = await prisma.party.findUnique({
    where: { id },
    include: {
      business: { select: { id: true, name: true } },
      categoryRef: { select: { id: true, name: true } },
      _count: { select: { applications: true } },
    },
  });

  if (!party) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            nativeButton={false}
            render={<Link href="/super-admin/parties" />}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold truncate">{party.title}</h1>
              {party.isActive ? (
                <Badge variant="secondary" className="text-xs">
                  모집중
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  종료
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {party.business?.name ?? "업체 미연결"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StartPartyButton
            endpoint={`/api/super-admin/parties/${party.id}/start`}
            partyTitle={party.title}
          />
          <ClosePartyButton
            partyId={party.id}
            partyTitle={party.title}
            isActive={party.isActive}
          />
          <Button
            nativeButton={false}
            render={<Link href={`/super-admin/parties/${party.id}/edit`} />}
          >
            <Pencil className="w-4 h-4 mr-2" />
            수정
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">파티 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <Row
              label="일시"
              value={party.date.toLocaleString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
            <Row label="장소" value={party.location} />
            <Row
              label="정원"
              value={`${party.currentCount} / ${party.maxCapacity}`}
            />
            <Row
              label="참가비"
              value={`남 ${party.priceMale.toLocaleString()}원 · 여 ${party.priceFemale.toLocaleString()}원`}
            />
            <Row
              label="카테고리"
              value={party.categoryRef?.name ?? party.category}
            />
            <Row label="성비" value={party.genderRatio} />
            <Row
              label="입장"
              value={party.admissionMode === "INSTANT" ? "즉시 입장" : "승인 후 입장"}
            />
            <Row label="신청" value={`${party._count.applications}건`} />
            {party.business && (
              <Row
                label="업체"
                value={
                  <Link
                    href={`/super-admin/businesses/${party.business.id}`}
                    className="text-primary hover:underline"
                  >
                    {party.business.name}
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">소개</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {party.description || "소개 없음"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
