import { redirect } from "next/navigation";

export default function SuperAdminPartiesRedirectPage() {
  redirect("/app/parties");
}
