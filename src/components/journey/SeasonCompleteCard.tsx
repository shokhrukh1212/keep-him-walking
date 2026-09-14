import type { SeasonSponsorView, SeasonView } from "@/lib/contracts";
import { formatSeasonInstant } from "@/lib/sponsors/season-offer";

/**
 * The small, honest end of a season: confirmed totals only, the sponsor it had, and
 * a return date only when a next season is actually configured.
 */
export function SeasonCompleteCard({ season, sponsor }: { season: SeasonView; sponsor: SeasonSponsorView | null }) {
  const recap = season.recap;
  const settled = recap ? recap.finalizedDays >= recap.totalDays : false;
  return (
    <section className="season-complete" data-hud-region="season-complete" aria-label={`Season ${season.number} complete`}>
      <p className="season-complete-title">Season {season.number} complete</p>
      {recap ? (
        <p>
          <strong>{(recap.distanceMetres / 1_000).toFixed(1)} km</strong> walked together
          {settled ? "" : " · confirmed so far"} · {recap.citiesWalked.length} of {recap.totalDays} cities walked
        </p>
      ) : <p>The season totals are being confirmed.</p>}
      {recap?.citiesWalked.length ? (
        <p className="season-complete-cities">{recap.citiesWalked.map((city) => city.cityName).join(" · ")}</p>
      ) : null}
      {sponsor ? (
        <p className="season-complete-sponsor">
          Season supported by{" "}
          <a href={sponsor.href} target="_blank" rel="sponsored noopener noreferrer">{sponsor.name} ↗</a>
        </p>
      ) : null}
      {season.next ? <p>Season {season.next.number} starts {formatSeasonInstant(season.next.startsAt)}.</p> : null}
    </section>
  );
}
