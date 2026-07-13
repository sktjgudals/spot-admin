import { prisma } from "@/lib/prisma";
import { Provider, Role } from "@/generated/prisma";

export type HostCandidate = {
  id: string;
  nickname: string;
  email: string;
};

/** 파티 기술 소유자(Party.adminId). 앱 UI 미노출. */
export async function ensureTechnicalPartyHost(
  businessId: string,
  businessName: string,
): Promise<string> {
  const socialId = `biz_tech_${businessId}`;
  const email = `biz-tech-${businessId}@system.dopa.local`;

  const existing = await prisma.user.findUnique({
    where: { socialId_provider: { socialId, provider: Provider.KAKAO } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (byEmail) return byEmail.id;

  const created = await prisma.user.create({
    data: {
      email,
      nickname: `${businessName} (시스템)`,
      socialId,
      provider: Provider.KAKAO,
      role: Role.USER,
      businessId,
    },
    select: { id: true },
  });
  return created.id;
}

export async function getBusinessHostCandidates(
  businessId: string,
  options?: { includeUserId?: string | null },
): Promise<HostCandidate[]> {
  const [linkedUsers, adminAccounts, business] = await Promise.all([
    prisma.user.findMany({
      where: { businessId },
      select: { id: true, nickname: true, email: true },
      orderBy: { nickname: "asc" },
    }),
    prisma.adminAccount.findMany({
      where: { businessId, isActive: true, role: "BUSINESS" },
      select: { email: true },
    }),
    prisma.business.findUnique({
      where: { id: businessId },
      select: { contactEmail: true },
    }),
  ]);

  const emails = new Set<string>();
  for (const a of adminAccounts) {
    if (a.email) emails.add(a.email);
  }
  if (business?.contactEmail) emails.add(business.contactEmail);

  const emailMatched =
    emails.size > 0
      ? await prisma.user.findMany({
          where: {
            OR: [...emails].map((email) => ({
              email: { equals: email, mode: "insensitive" as const },
            })),
          },
          select: { id: true, nickname: true, email: true },
        })
      : [];

  const map = new Map<string, HostCandidate>();
  for (const u of [...linkedUsers, ...emailMatched]) {
    map.set(u.id, u);
  }

  if (options?.includeUserId && !map.has(options.includeUserId)) {
    const current = await prisma.user.findUnique({
      where: { id: options.includeUserId },
      select: { id: true, nickname: true, email: true },
    });
    if (current) map.set(current.id, current);
  }

  return [...map.values()].sort((a, b) =>
    a.nickname.localeCompare(b.nickname, "ko"),
  );
}

export async function assertBusinessHost(
  businessId: string,
  userId: string,
  currentHostId?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const candidates = await getBusinessHostCandidates(businessId, {
    includeUserId: currentHostId,
  });
  if (!candidates.some((c) => c.id === userId)) {
    return {
      ok: false,
      message: "선택한 담당자는 이 업체의 호스트 후보가 아닙니다",
    };
  }
  return { ok: true };
}
