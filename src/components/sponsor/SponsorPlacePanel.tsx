"use client";

import { useState, type FormEvent } from "react";
import { formatPriceUsd } from "@/lib/sponsors/pricing";
import {
  SPONSOR_PLACE_PRICE_CENTS,
  placeName,
  type SponsorPlace,
} from "@/lib/sponsors/places";
import { SponsorPlaceMark } from "./SponsorPlaceMark";

const PRICE = formatPriceUsd(SPONSOR_PLACE_PRICE_CENTS);

/**
 * What a taken place has to say for itself: what the product is, how it has done
 * here so far, and one way to go and look at it.
 *
 * The two numbers are fixture values, not a measurement, and the line under them
 * says so. Nothing here may present a count the server has not confirmed as
 * though it had.
 */
function TakenPlace({ place }: { place: SponsorPlace }) {
  const brand = place.brand;
  if (!brand) return null;
  return (
    <div className="sponsor-place-panel" data-state="taken">
      <div className="sponsor-place-hero">
        <span className="sponsor-place-mark" data-size="large"><SponsorPlaceMark mark={brand.mark} /></span>
        <div>
          <strong>{brand.name}</strong>
          <p className="journey-muted">{brand.description}</p>
        </div>
      </div>
      <dl className="sponsor-place-stats">
        <div><dt>Views</dt><dd>{brand.views.toLocaleString("en-US")}</dd></div>
        <div><dt>Clicks</dt><dd>{brand.clicks.toLocaleString("en-US")}</dd></div>
        <div><dt>Place</dt><dd>{placeName(place)}</dd></div>
      </dl>
      <p className="sponsor-place-note">Placeholder figures — this placement is not measured yet.</p>
      <a
        className="primary-button"
        href={brand.href}
        target="_blank"
        rel="sponsored noopener noreferrer"
        aria-label={`Visit ${brand.name} (opens in a new tab)`}
      >
        Visit {brand.name} ↗
      </a>
      <p className="policy-copy">Sponsored placement.</p>
    </div>
  );
}

/**
 * What a free place has to say: the price, and a checkout.
 *
 * The checkout is a front end only. Nothing is submitted, stored or charged, and
 * the visitor is told so in the same words on the button they press. Wire it to the
 * provider the featured sponsor already uses when the product is decided.
 */
function FreePlace({ place }: { place: SponsorPlace }) {
  const [submitted, setSubmitted] = useState(false);
  const name = placeName(place);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="sponsor-place-panel" data-state="free">
      <p className="sponsor-place-lead">{name} is free. {PRICE} to take it.</p>
      <p className="journey-muted">
        Your mark sits beside the walk with the other places, and a visitor who presses it sees
        your name, one line about the product and a link to it. One-time payment, no renewal.
        Audience size and results are not guaranteed.
      </p>
      <form className="sponsor-form sponsor-place-form" onSubmit={submit}>
        <label>Product name
          <input name="productName" minLength={2} maxLength={60} required autoComplete="organization" />
        </label>
        <label>Website
          <input name="productUrl" type="url" placeholder="https://" required autoComplete="url" />
        </label>
        <label>Contact email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <dl className="sponsor-place-order">
          <div><dt>{name}</dt><dd>{PRICE}</dd></div>
          <div data-total="true"><dt>Total today</dt><dd>{PRICE}</dd></div>
        </dl>
        <button className="primary-button" type="submit">Pay {PRICE}</button>
        {submitted ? (
          <p className="sponsor-place-note" role="status">
            Checkout is not connected yet, so nothing was charged and nothing you typed was sent anywhere.
          </p>
        ) : null}
      </form>
      <p className="policy-copy">
        Every product is reviewed before it appears. A place carries a name, a mark and one link —
        no other copy.
      </p>
    </div>
  );
}

/** The one modal both kinds of place open. */
export function SponsorPlacePanel({ place }: { place: SponsorPlace }) {
  return place.brand ? <TakenPlace place={place} /> : <FreePlace place={place} />;
}
