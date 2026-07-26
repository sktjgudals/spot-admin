import type { ReactNode } from "react";
import SuperAdminShell from "./SuperAdminShell";

/**
 * SUPER_ADMIN portal — original AdminSidebar chrome restored.
 * force-dynamic: pages hit Prisma at request time (not build/prerender).
 */
export const dynamic = "force-dynamic";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
