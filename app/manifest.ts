import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "House of Eon Operations", short_name: "Eon Operations",
    description: "Manage orders, customers, inventory and WhatsApp on the go.",
    start_url: "/orders", scope: "/", display: "standalone",
    background_color: "#faf7f0", theme_color: "#1c1712",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
