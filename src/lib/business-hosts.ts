import { prisma } from "@/lib/prisma";

export type HostCandidate = {
  id: string;
  nickname: string;
  email: string;
};

/**
 * 업체 파티 호스트(Party.adminId = User.id) 후보.
 * - User.businessId 가 업체인 앱 계정
 * - AdminAccount(BUSINESS) 이메일과 일치하는 User
 * - Business.contactEmail 과 일치하는 User
 * - includeUserId: 현재 호스트가 후보에 없어도 목록에 포함
 */
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
