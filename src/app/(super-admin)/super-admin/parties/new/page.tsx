import { redirect } from "next/navigation";

export default function SuperAdminPartyCreateRedirectPage() {
  redirect("/app/parties/new");
}
