import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// The OpenNext adapter is needed for the Cloudflare Worker dev/preview path,
// but Vercel supplies its own Next.js runtime and must not initialize it.
if (!process.env.VERCEL) initOpenNextCloudflareForDev();

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
    // The meal multipart parser accepts up to 41 MiB. Next's proxy otherwise
    // truncates the request at its 10 MiB default before the route can reject
    // or parse it, which is especially damaging for six-photo submissions.
    proxyClientMaxBodySize: 41 * 1024 * 1024,
  },
};

export default nextConfig;
