import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "bcryptjs"],
  // `pg` resolves an empty shim during the Node trace, but OpenNext bundles
  // with the workerd condition and needs the real Cloudflare socket adapter.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pg-cloudflare/dist/**/*"],
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
