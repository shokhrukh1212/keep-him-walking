import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keep Him Walking",
    short_name: "Keep Walking",
    description: "One traveler. One shared journey. He only walks while someone is watching.",
    start_url: "/",
    display: "standalone",
    background_color: "#101b24",
    theme_color: "#101b24",
  };
}
