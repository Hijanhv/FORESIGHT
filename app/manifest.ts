import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Foresight — feel a goal coming",
    short_name: "Foresight",
    description:
      "The momentum-vs-market gap, made beautiful. Powered by TxLINE live odds + events.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1a2e",
    theme_color: "#0e1a2e",
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
