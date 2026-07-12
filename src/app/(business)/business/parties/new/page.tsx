import { auth } from "@/lib/auth";
import { getBusinessHostCandidates } from "@/lib/business-hosts";
import { redirect } from "next/navigation";
import NewPartyForm from "./NewPartyForm";

export default async function NewPartyPage() {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (!businessId) redirect("/login");

  const hostCandidates = await getBusinessHostCandidates(businessId);

  return <NewPartyForm hostCandidates={hostCandidates} />;
}
