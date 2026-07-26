import type { ReactNode } from "react";
import BusinessShell from "./BusinessShell";

export const dynamic = "force-dynamic";

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return <BusinessShell>{children}</BusinessShell>;
}
