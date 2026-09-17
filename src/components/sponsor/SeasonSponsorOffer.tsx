"use client";

import { useEffect, useState } from "react";
import type { SeasonOffer } from "@/lib/sponsors/season-data";
import { SEASON_OFFER_COPY, formatSeasonInstant, formatUsdCents, seasonOfferHeadline, seasonTaxNote } from "@/lib/sponsors/season-offer";

type Load = { state: "loading" } | { state: "ready"; offer: SeasonOffer } | { state: "failed" };

/** The Sponsor modal's body. The offer is read only when the modal opens, never on the scene. */
export function SeasonSponsorOffer() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/season-sponsor/offer", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Offer unavailable");
        setLoad({ state: "ready", offer: await response.json() as SeasonOffer });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "failed" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="sponsor-copy season-offer" data-testid="season-offer">
      <p className="season-offer-lead">{SEASON_OFFER_COPY.lead}</p>
      <p className="season-offer-headline">
        {load.state === "ready" ? seasonOfferHeadline(load.offer.priceCents) : SEASON_OFFER_COPY.headline}
      </p>
      <p>{SEASON_OFFER_COPY.body}</p>
      {load.state === "loading" ? <p role="status">Checking the next available season…</p> : null}
      {load.state === "failed" ? (
        <p role="status">
          The season dates could not be loaded here. The full offer is at{" "}
          <a href="/sponsors" target="_blank" rel="noopener">keephimwalking.com/sponsors</a>.
        </p>
      ) : null}
      {load.state === "ready" ? <SeasonOfferDetails offer={load.offer} /> : null}
    </div>
  );
}

export function SeasonOfferDetails({ offer }: { offer: SeasonOffer }) {
  const current = offer.currentSponsor
    ? <p>Season {offer.currentSponsor.seasonNumber} is supported by {offer.currentSponsor.name}.</p>
    : null;
  if (!offer.season) {
    return (
      <>
        {current}
        <p className="booking-off">
          No season is open for sponsorship right now. Dates are published here as soon as the next season is scheduled.
        </p>
        {offer.checkout === "request_only" && offer.ownerXUrl ? <p className="season-contact-x">
          <a href={offer.ownerXUrl} target="_blank" rel="noopener noreferrer">Message me on X ↗</a>
        </p> : null}
        <p><a href="/sponsors" target="_blank" rel="noopener">Offer details, refund policy and terms ↗</a></p>
      </>
    );
  }
  const season = offer.season;
  return (
    <>
      {current}
      <dl className="season-offer-facts" data-testid="season-offer-facts">
        <div><dt>Next available</dt><dd>Season {season.number}</dd></div>
        <div><dt>Starts</dt><dd>{formatSeasonInstant(season.startsAt)}</dd></div>
        <div><dt>Ends</dt><dd>{formatSeasonInstant(season.endsAt)}</dd></div>
        {season.cities.length ? <div><dt>Cities</dt><dd>{season.cities.join(" · ")}</dd></div> : null}
        <div><dt>Booking closes</dt><dd>{formatSeasonInstant(season.saleClosesAt)}</dd></div>
        <div><dt>Price</dt><dd>{formatUsdCents(offer.priceCents)}, one time</dd></div>
      </dl>
      <p>{seasonTaxNote(offer.priceIncludesTax, offer.priceCents)}</p>
      {offer.checkout === "request_only" ? (
        <>
          <p className="booking-off">
            <strong>Checkout is not open yet.</strong> Send your material for review. Approval keeps it ready for checkout later, but takes no payment and does not reserve the season.
          </p>
          {offer.ownerXUrl ? <p className="season-contact-x">
            Prefer to talk first? <a href={offer.ownerXUrl} target="_blank" rel="noopener noreferrer">Message me on X ↗</a>
          </p> : null}
        </>
      ) : <p className="booking-off">
        Enter your details and continue straight to checkout. The placement is not booked until its payment is confirmed.
      </p>}
      <a className="primary-button season-offer-cta" href="/sponsors#request" target="_blank" rel="noopener">
        {offer.checkout === "enabled" ? "Sponsor this season" : "Request this season"}
      </a>
    </>
  );
}
