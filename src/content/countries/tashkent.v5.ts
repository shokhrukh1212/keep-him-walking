import { countryPackV3Schema } from "@/lib/content/schema";
import { tashkentCountryPackV4 } from "./tashkent.v4";

/**
 * The launch registration for the owner-approved, calibrated Tashkent pack.
 * V5 deliberately reuses the immutable V4 paintings: this revision changes the
 * launch identity, not pixels, route calibration or reviewed cultural content.
 */
export const tashkentCountryPackV5 = countryPackV3Schema.parse({
  ...tashkentCountryPackV4,
  packId: "tashkent-v5",
  assetVersion: "tashkent-v5",
  revision: 5,
  culturalReview: {
    ...tashkentCountryPackV4.culturalReview,
    notes: `${tashkentCountryPackV4.culturalReview.notes} Launch revision v5 retains the calibrated and owner-approved v4 artwork without alteration.`,
  },
});
