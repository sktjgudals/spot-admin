import { redirect } from "next/navigation";

/**
 * Legacy SUPER_ADMIN portal — cut over to Auth v2 `/app/businesses`.
 * NextAuth removed (PR3). Unmigrated features return via future Nest APIs.
 */
export default function LegacySuperAdminLayout() {
  redirect("/app/businesses");
}
