import type { ReactNode } from "react";
import SuperAdminShell from "./SuperAdminShell";

/**
 * SUPER_ADMIN portal — original AdminSidebar chrome restored.
 * Pages are client/API driven; dynamic rendering keeps auth routing explicit.
 */
export const dynamic = "force-dynamic";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
