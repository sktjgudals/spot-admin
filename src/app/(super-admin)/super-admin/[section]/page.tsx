"use client";

import { useParams } from "next/navigation";
import { AdminResourceConsole, resourceConfigs } from "@/components/admin/AdminResourceConsole";

export default function SuperAdminSectionPage() {
  const params = useParams<{ section: string }>();
  const section = params.section;
  if (section === "payments") {
    return <div className="space-y-10"><AdminResourceConsole config={resourceConfigs.payments} /><AdminResourceConsole config={resourceConfigs.refunds} /></div>;
  }
  if (section === "review-tags") {
    return <div className="space-y-10"><AdminResourceConsole config={resourceConfigs["review-tag-categories"]} /><AdminResourceConsole config={resourceConfigs["review-tags"]} /></div>;
  }
  const config = resourceConfigs[section];
  if (!config) return <div className="rounded-lg border bg-background p-8"><h1 className="text-xl font-bold">메뉴를 찾을 수 없습니다.</h1></div>;
  return <AdminResourceConsole config={config} />;
}
