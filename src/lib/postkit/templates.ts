import { flagEmoji } from "@/lib/countries/flags";

export type PostKitTemplateInput = {
  dayNumber: number;
  cityName: string;
  countryName: string;
  countryCode: string;
  distanceMetres: number;
  landmarkReached: boolean;
  marathon: boolean;
  uniqueWatchers: number;
  countriesCount: number;
  topCountryName: string | null;
  topCountryCode: string | null;
  sponsorName: string | null;
  tomorrowCountryName: string | null;
  tomorrowVote: Array<{ label: string; code: string | null; votes: number }>;
  sponsorPriceCents: number | null;
  foundingPriceCents: number | null;
};

export type PostKitText = {
  recapText: string;
  homeTeamText: string;
  voteText: string;
  priceText: string;
};

function dollars(cents: number) {
  return Number.isInteger(cents / 100) ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export function postKitTemplates(input: PostKitTemplateInput): PostKitText {
  const km = (input.distanceMetres / 1_000).toFixed(1);
  const sponsor = input.sponsorName ? ` Sponsored by ${input.sponsorName}.` : "";
  const tomorrow = input.tomorrowCountryName ? ` Tomorrow: ${input.tomorrowCountryName}.` : "";
  const top = input.topCountryCode && input.topCountryName
    ? ` ${flagEmoji(input.topCountryCode)} ${input.topCountryName} carried him longest.`
    : "";
  const recapText = input.marathon
    ? `Day ${input.dayNumber} · ${input.cityName}. Marathon. ${km} km. ${input.uniqueWatchers.toLocaleString()} watchers from ${input.countriesCount.toLocaleString()} countries.${top}${sponsor}${tomorrow}`
    : input.landmarkReached
      ? `Day ${input.dayNumber} · ${input.cityName}. Landmark reached. ${km} km. ${input.uniqueWatchers.toLocaleString()} watchers from ${input.countriesCount.toLocaleString()} countries.${top}${sponsor}${tomorrow}`
      : `Day ${input.dayNumber} · ${input.cityName}. ${km} km. He didn't reach the landmark. Grey stamp. That one's on us.${sponsor}${tomorrow}`;

  const homeTeamText = `${flagEmoji(input.countryCode)} ${input.countryName}, this is your stamp. He walked ${km} km through ${input.cityName}.`;
  const voteTotal = input.tomorrowVote.reduce((sum, option) => sum + option.votes, 0);
  const voteOptions = input.tomorrowVote.map((option) => {
    const percent = voteTotal > 0 ? Math.round(option.votes / voteTotal * 100) : 0;
    return `${option.code ? `${flagEmoji(option.code)} ` : ""}${option.label} ${percent}`;
  }).join(" — ");
  const voteText = voteOptions
    ? `Tomorrow: ${voteOptions}. Closes 16:00 UTC.`
    : "Tomorrow's vote is not available yet.";
  const priceText = input.sponsorPriceCents === null
    ? "Tomorrow's sponsor slot is not available yet."
    : `Tomorrow's sponsor slot: ${dollars(input.sponsorPriceCents)}.${input.foundingPriceCents === null ? "" : ` Day 1 was ${dollars(input.foundingPriceCents)}.`} Price is set by yesterday's watchers.`;

  return { recapText, homeTeamText, voteText, priceText };
}
