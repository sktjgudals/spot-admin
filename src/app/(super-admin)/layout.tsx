import type { ReactNode } from "react";
import SuperAdminShell from "./SuperAdminShell";

/** SUPER_ADMIN portal. All data is loaded from the Cloudflare Admin API. */
export const dynamic = "force-dynamic";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
