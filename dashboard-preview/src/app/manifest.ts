import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HyperFix, la fixation — notre raison d'être.",
    short_name: "HyperFix",
    description: "HyperFix, la fixation — notre raison d'être.",
    start_url: "/story/dashboard/mix2",
    display: "standalone",
    background_color: "#171717",
    theme_color: "#171717",
    icons: [
      {
        src: "/story/hyper.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/story/icon-maskable.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
