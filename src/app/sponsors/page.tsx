import Link from "next/link";
import type { Metadata } from "next";
import { SponsorCheckoutForm } from "@/components/sponsor/SponsorCheckoutForm";
import { loadSponsorWindow } from "@/lib/sponsors/data";
import { formatPriceUsd, priceBasisSentence, tierPriceCents } from "@/lib/sponsors/pricing";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Sponsor a day of the walk",
  description:
    "One sponsor per day. Your logo on his backpack, on screen all day, in the recap. "
    + "Prices are public, rise with the audience, and never change for a day you already bought.",
};

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

function labelForDate(date: string): string {
  return WEEKDAY.format(new Date(`${date}T00:00:00Z`));
}

export default async function SponsorsPage() {
  const window = await loadSponsorWindow();

  if (!window) {
    return <main className="content-page sponsors-page">
      <Link className="back-link" href="/">← Return to the walk</Link>
      <span className="eyebrow">SPONSOR A DAY</span>
      <h1>Sponsor a day of the walk.</h1>
      <p>No days are open for sale yet. The rolling window opens at the first daily rollover.</p>
    </main>;
  }

  const openDays = window.days.filter((day) => day.available && !day.soldTo);
  const firstOpen = openDays[0] ?? null;
  const slots = openDays
    .filter((day) => day.slotId)
    .map((day) => ({
      id: day.slotId!,
      label: day.city ? `${labelForDate(day.date)} · ${day.city}` : labelForDate(day.date),
      priceCents: day.priceCents,
      currency: "USD",
    }));

  return <main className="content-page sponsors-page">
    <Link className="back-link" href="/">← Return to the walk</Link>
    <span className="eyebrow">SPONSOR A DAY</span>
    <h1>Sponsor a day of the walk.</h1>
    <p>
      One sponsor per day. Your logo on his backpack, on screen all day, in the recap, on X.
      {firstOpen ? <>
        {" "}Next up{firstOpen.city ? <>: {firstOpen.city}</> : null} — <strong>{priceBasisSentence(firstOpen.priceCents, firstOpen.basisUniques, firstOpen.founding)}</strong>.
      </> : null}
    </p>

    <table className="sponsor-calendar" data-testid="sponsor-calendar">
      <caption className="visually-hidden">The {window.days.length} days currently open for sale</caption>
      <thead>
        <tr>{window.days.map((day) => <th key={day.date} scope="col">{labelForDate(day.date)}</th>)}</tr>
      </thead>
      <tbody>
        <tr>
          {window.days.map((day) => (
            <td key={day.date} data-sold={day.soldTo ? "true" : "false"} data-testid="sponsor-day">
              {day.soldTo
                ? <><span aria-hidden="true">✓</span> {day.soldTo}</>
                : day.available ? formatPriceUsd(day.priceCents) : "—"}
            </td>
          ))}
        </tr>
      </tbody>
    </table>

    <section aria-labelledby="sponsor-pricing-heading">
      <h2 id="sponsor-pricing-heading">How the price is set</h2>
      <p className="sponsor-formula" data-testid="sponsor-formula">
        A day costs one cent per unique watcher the day before, with a floor of{" "}
        {formatPriceUsd(window.floorCents)} and a cap of {formatPriceUsd(window.capCents)}.
        {firstOpen && !firstOpen.founding && firstOpen.basisUniques > 0
          ? <> Today that is <strong>{priceBasisSentence(firstOpen.priceCents, firstOpen.basisUniques, false)}</strong>.</>
          : null}
      </p>
      <p>
        Buy early. The price only goes up if the internet keeps showing up — and it never
        changes for a day you already bought.
      </p>
      <p>
        Standard {firstOpen ? formatPriceUsd(firstOpen.priceCents) : formatPriceUsd(window.floorCents)}
        {" · "}
        Premium {firstOpen
          ? formatPriceUsd(tierPriceCents(firstOpen.priceCents, "premium", window.premiumMultiplier))
          : formatPriceUsd(tierPriceCents(window.floorCents, "premium", window.premiumMultiplier))}
        {" "}(he drinks from your bottle).
      </p>
      <p>Creative is reviewed within 12 h. Payment never bypasses that review.</p>
    </section>

    <section aria-labelledby="sponsor-buy-heading">
      <h2 id="sponsor-buy-heading">Buy a day</h2>
      <p>
        A sponsor buys a day, not a country. The country is decided one day ahead by the
        vote{window.currentCity ? <>; he is in {window.currentCity} right now</> : null}.
      </p>
      <SponsorCheckoutForm slots={slots} premiumMultiplier={window.premiumMultiplier} />
    </section>

    <nav className="legal-links">
      <Link href="/sponsor-terms">Sponsor terms</Link>
      <Link href="/refund-policy">Refund &amp; creative policy</Link>
      <Link href="/contact">Contact</Link>
    </nav>
  </main>;
}
