import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Soma",
    short_name: "Soma",
    description: "Personal health and nutrition laboratory: sleep, recovery, activity.",
    lang: "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icons/soma-192.png?v=soma-symbol-1",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/soma-512.png?v=soma-symbol-1",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/soma-maskable-512.png?v=soma-symbol-1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
