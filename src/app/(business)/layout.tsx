import { redirect } from "next/navigation";

/**
 * Legacy BUSINESS portal — cut over to Auth v2 `/app/parties`.
 * NextAuth removed (PR3).
 */
export const dynamic = "force-dynamic";

export default function LegacyBusinessLayout() {
  redirect("/app/parties");
}
