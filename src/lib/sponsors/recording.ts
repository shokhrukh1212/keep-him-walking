import type { SponsorInventoryView, SponsorPlacementView } from "@/lib/contracts";

type RecordingBrand = {
  name: string;
  domain: string;
  websiteUrl: string;
  description: string;
};

const REGULAR_BRANDS: readonly RecordingBrand[] = [
  { name: "Google", domain: "google.com", websiteUrl: "https://google.com/", description: "Search, maps and everyday tools." },
  { name: "ChatGPT", domain: "chatgpt.com", websiteUrl: "https://chatgpt.com/", description: "AI for writing, learning and building." },
  { name: "Claude", domain: "claude.ai", websiteUrl: "https://claude.ai/", description: "An AI assistant from Anthropic." },
  { name: "Figma", domain: "figma.com", websiteUrl: "https://figma.com/", description: "Collaborative product design." },
  { name: "GitHub", domain: "github.com", websiteUrl: "https://github.com/", description: "The home for software projects." },
  { name: "Notion", domain: "notion.so", websiteUrl: "https://notion.so/", description: "A connected workspace for teams." },
  { name: "Spotify", domain: "spotify.com", websiteUrl: "https://spotify.com/", description: "Music and podcasts for every walk." },
  { name: "Slack", domain: "slack.com", websiteUrl: "https://slack.com/", description: "Team communication in one place." },
  { name: "Canva", domain: "canva.com", websiteUrl: "https://canva.com/", description: "Visual design for everyone." },
  { name: "Linear", domain: "linear.app", websiteUrl: "https://linear.app/", description: "Purpose-built product development." },
] as const;

const FEATURED_BRAND: RecordingBrand = {
  name: "Postis",
  domain: "postis.eu",
  websiteUrl: "https://www.postis.eu/",
  description: "A digital platform for smarter last-mile delivery.",
};

function favicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function recordingPlacement(place: SponsorPlacementView, brand: RecordingBrand): SponsorPlacementView {
  return {
    ...place,
    state: "occupied",
    placement: {
      publicId: `00000000-0000-4000-9000-${String(place.position).padStart(12, "0")}`,
      name: brand.name,
      description: brand.description,
      logoUrl: favicon(brand.domain),
      logoFit: "contain",
      websiteUrl: brand.websiteUrl,
      views: 0,
      demo: true,
    },
  };
}

/** Local launch-video dressing. It never creates orders or modifies persisted inventory. */
export function recordingSponsorInventory(inventory: SponsorInventoryView): SponsorInventoryView {
  return {
    ...inventory,
    regularFilled: 10,
    featuredFilled: true,
    slots: inventory.slots.map((place) => recordingPlacement(
      place,
      place.tier === "featured" ? FEATURED_BRAND : REGULAR_BRANDS[place.position - 1] ?? REGULAR_BRANDS[0],
    )),
  };
}
