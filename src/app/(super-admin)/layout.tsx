import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminSidebar, { MobileHeader } from "@/components/layout/AdminSidebar";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") redirect("/login");

  const sidebarProps = {
    role: "SUPER_ADMIN" as const,
    name: session.user.name,
    email: session.user.email,
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
