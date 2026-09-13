import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "bcryptjs"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      // The CRM has its own dedicated frontend at /crm (no dashboard chrome)
      { source: "/dashboard/crm", destination: "/crm", permanent: false },
    ];
  },
};

export default nextConfig;
