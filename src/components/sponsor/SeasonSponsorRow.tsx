import type { SeasonSponsorView } from "@/lib/contracts";

/** The Journey row: logo, name, one factual line and a link. Nothing more. */
export function SeasonSponsorRow({ sponsor }: { sponsor: SeasonSponsorView }) {
  return (
    <div className="season-sponsor-row" data-testid="season-sponsor-row">
      {/* eslint-disable-next-line @next/next/no-img-element -- an approved, immutable storage URL */}
      <img src={sponsor.logoUrl} alt="" width={44} height={44} decoding="async" />
      <div>
        <strong>{sponsor.name}</strong>
        <p className="journey-muted">{sponsor.description}</p>
        <a
          href={sponsor.href}
          target="_blank"
          rel="sponsored noopener noreferrer"
          aria-label={`Visit ${sponsor.name}'s website (opens in a new tab)`}
        >
          Visit website ↗
        </a>
      </div>
    </div>
  );
}
