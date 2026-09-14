import type { SeasonSponsorView } from "@/lib/contracts";

/**
 * The season's one disclosed placement on the scene: a single quiet line in the
 * status row, never over him, a caption or the route. It opens the sponsor's own
 * site in a new tab so the walk keeps going here.
 */
export function SeasonSponsorLine({ sponsor }: { sponsor: SeasonSponsorView }) {
  return (
    <a
      className="season-sponsor-line"
      data-hud-region="season-sponsor"
      href={sponsor.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      aria-label={`Season supported by ${sponsor.name}. Opens their website in a new tab.`}
    >
      <span className="season-sponsor-label">
        <span className="season-sponsor-label-long">Season supported by</span>
        {/* A phone keeps the disclosure, in fewer characters. */}
        <span className="season-sponsor-label-short">Supported by</span>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- an approved, immutable storage URL */}
      <img src={sponsor.logoUrl} alt="" width={20} height={20} decoding="async" />
      <span className="season-sponsor-name">{sponsor.name}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
