import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "bcryptjs", "@google-cloud/storage"],
};

export default nextConfig;
