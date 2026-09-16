import { SPONSOR_INQUIRY_COPY } from "@/lib/sponsors/inquiry";

type Props = {
  /** The owner's public X profile; without one the contact line still says no payment is taken. */
  xUrl: string | null;
};

/**
 * The Sponsor modal in inquiry mode: a proposed offer, a checkout that cannot be used, and
 * one way to get in touch. It reads nothing and submits nothing.
 */
export function SponsorInquiry({ xUrl }: Props) {
  const noteId = "sponsor-inquiry-checkout-note";
  return (
    <div className="sponsor-copy sponsor-inquiry" data-testid="sponsor-inquiry">
      <p className="season-offer-headline">{SPONSOR_INQUIRY_COPY.headline}</p>
      <p className="season-offer-lead">{SPONSOR_INQUIRY_COPY.price}</p>
      <p>{SPONSOR_INQUIRY_COPY.oneAtATime}</p>
      <p>{SPONSOR_INQUIRY_COPY.rule}</p>
      <p className="booking-off">{SPONSOR_INQUIRY_COPY.pending}</p>
      <div className="sponsor-inquiry-actions">
        <div className="sponsor-inquiry-checkout">
          <button type="button" className="sponsor-inquiry-disabled" disabled aria-describedby={noteId}>
            {SPONSOR_INQUIRY_COPY.checkoutLabel}
          </button>
          <small id={noteId}>{SPONSOR_INQUIRY_COPY.checkoutNote}</small>
        </div>
        {xUrl ? (
          <a className="primary-button season-offer-cta" href={xUrl} target="_blank" rel="noopener noreferrer">
            {SPONSOR_INQUIRY_COPY.xLabel} ↗
          </a>
        ) : null}
      </div>
      <p>{SPONSOR_INQUIRY_COPY.contact}</p>
      <p className="sponsor-inquiry-coffee">{SPONSOR_INQUIRY_COPY.coffee}</p>
    </div>
  );
}
