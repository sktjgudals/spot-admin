import { redirect } from "next/navigation";

/** Legacy NextAuth route — permanently redirected to Auth v2 shell (PR3). */
export default function LegacyBusinessRedirectPage() {
  redirect("/app/parties");
}
