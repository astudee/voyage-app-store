import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize snowflake-sdk for server-side only
  serverExternalPackages: ["snowflake-sdk"],
};

export default nextConfig;
