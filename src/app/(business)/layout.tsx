import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminSidebar, { MobileHeader } from "@/components/layout/AdminSidebar";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "BUSINESS") redirect("/login");

  const business = session.user.businessId
    ? await prisma.business.findUnique({
        where: { id: session.user.businessId },
        select: { logoUrl: true },
      })
    : null;

  const sidebarProps = {
    role: "BUSINESS" as const,
    name: session.user.name,
    email: session.user.email,
    businessName: session.user.businessName,
    businessLogoUrl: business?.logoUrl,
  };

  return (
    <div className="flex flex-col md:flex-row md:h-screen">
      <AdminSidebar {...sidebarProps} />
      <div className="flex-1 flex flex-col min-w-0 md:overflow-hidden">
        <MobileHeader {...sidebarProps} />
        <main className="flex-1 md:overflow-y-auto p-4 sm:p-5 lg:p-6 bg-slate-50 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}
