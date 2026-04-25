import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack due to Windows bug with PostCSS
  turbopack: {
    rules: {},
  },
};

export default nextConfig;
