import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["192.168.45.200"],
  devIndicators: false,
};

export default nextConfig;
