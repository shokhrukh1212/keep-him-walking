import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keep Him Walking",
    short_name: "Keep Walking",
    description: "He only walks while someone is watching. Drop in, meet the locals, and help him explore the world.",
    start_url: "/",
    display: "standalone",
    background_color: "#080f19",
    theme_color: "#080f19",
  };
}
