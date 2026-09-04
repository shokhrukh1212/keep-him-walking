import { createPhase2CountryPack, type Phase2CountryDefinition } from "./phase2-factory";

type ReviewSource = { title: string; url: string };

export function createPhase3EditorialPack(
  definition: Omit<Phase2CountryDefinition, "culturalReview">,
  citations: [ReviewSource, ...ReviewSource[]],
) {
  return createPhase2CountryPack({
    ...definition,
    culturalReview: {
      reviewerName: "Solo founder research review",
      reviewedAt: "2026-09-04T00:00:00.000Z",
      status: "provisional_preview",
      qualification: "Desk research using official city, tourism, museum and cultural-institution sources",
      disposition: "provisionally approved for private editorial preview",
      publicLaunchRequirement: "Qualified local review required before publication",
      citations,
      notes: "Provisional review covers route geography, architecture, food, language, flags, religious imagery and dialogue. This unpublished buffer pack has no native/local approval.",
    },
  });
}
