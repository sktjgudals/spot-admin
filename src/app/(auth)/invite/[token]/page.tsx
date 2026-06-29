import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BusinessSignupForm from "./BusinessSignupForm";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  const invitation = await prisma.businessInvitation.findUnique({
    where: { token },
    include: { business: true },
  });

  if (!invitation || invitation.used || invitation.expiresAt < new Date()) {
    notFound();
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">업체 어드민 가입</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{invitation.business.name}</span> 어드민으로 가입합니다
        </p>
      </div>
      <BusinessSignupForm token={token} email={invitation.email} />
    </div>
  );
}
