import type { Metadata } from "next";
import { publicGoogleClientId } from "@/auth/oidc/public-clients";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { parseAnalyticsProperties } from "@/features/analytics/property-config";

export const metadata: Metadata = {
  title: "Google Analytics",
};

export default function AnalyticsPage() {
  const config = parseAnalyticsProperties(process.env.NEXT_PUBLIC_GA4_PROPERTIES);

  return (
    <AnalyticsDashboard
      properties={config.ok ? config.properties : []}
      configError={config.ok ? null : config.message}
      googleClientId={publicGoogleClientId()}
    />
  );
}
