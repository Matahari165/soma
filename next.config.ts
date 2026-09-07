import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Soma serves authenticated meal photos through its own R2 route and does
  // not use next/image. Keeping Next's optimizer enabled would trace sharp
  // into the Cloudflare bundle even though no route needs it.
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
