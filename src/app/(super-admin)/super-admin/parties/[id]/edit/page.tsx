import { redirect } from "next/navigation";

export default async function SuperAdminPartyEditRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/parties/${encodeURIComponent(id)}`);
}
