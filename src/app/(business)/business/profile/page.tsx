import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import BusinessProfileForm from "./BusinessProfileForm";

export default async function BusinessProfilePage() {
  const session = await auth();
  const businessId = session?.user.businessId;
  if (!businessId) redirect("/business/dashboard");

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      tagline: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
      _count: { select: { parties: { where: { isActive: true } } } },
    },
  });
  if (!business) redirect("/business/dashboard");

  return (
    <div className="w-full max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">업체 프로필</h1>
        <p className="text-sm text-muted-foreground">
          앱 파티 상세·업체 프로필 화면에 노출되는 정보를 편집합니다.
        </p>
      </div>
      <BusinessProfileForm
        initial={{
          id: business.id,
          name: business.name,
          tagline: business.tagline,
          description: business.description,
          logoUrl: business.logoUrl,
          coverUrl: business.coverUrl,
          activePartyCount: business._count.parties,
        }}
      />
    </div>
  );
}
