import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Soma",
    short_name: "Soma",
    description: "Suivi santé et nutrition : repas, énergie, récupération.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons: [
      {
        src: "/icons/soma-192.png?v=discobolus-2",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/soma-512.png?v=discobolus-2",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/soma-maskable-512.png?v=discobolus-2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
