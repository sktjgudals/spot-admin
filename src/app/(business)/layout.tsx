import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminSidebar from "@/components/layout/AdminSidebar";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session || session.user.role !== "BUSINESS") redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        role="BUSINESS"
        name={session.user.name}
        email={session.user.email}
        businessName={session.user.businessName}
      />
      <main className="flex-1 overflow-y-auto p-6 bg-slate-50">{children}</main>
    </div>
  );
}
