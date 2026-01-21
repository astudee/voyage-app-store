/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["snowflake-sdk"],
  },
};

export default nextConfig;
