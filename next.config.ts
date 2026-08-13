import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: import.meta.dirname },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react"],
  },
};

export default nextConfig;
