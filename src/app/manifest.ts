import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Music Discovery",
    short_name: "Discovery",
    description: "Daily new-music feed from your own sources",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#0a0a0a",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
