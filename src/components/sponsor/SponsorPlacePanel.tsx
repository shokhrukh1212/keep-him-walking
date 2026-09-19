"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { SponsorPlace } from "@/lib/sponsors/places";
import { formatPriceUsd } from "@/lib/sponsors/pricing";

type Checkout = { checkoutUrl: string; paymentProvider: "dodo" | "fixture"; testMode: boolean };

function ProductProfile({ place }: { place: SponsorPlace }) {
  const product = place.placement;
  if (!product) return null;
  return (
    <div className="sponsor-place-panel" data-state="taken">
      <div className="sponsor-place-hero">
        <span className="sponsor-place-mark" data-size="large">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.logoUrl} alt="" className="sponsor-place-logo" data-fit={product.logoFit} />
        </span>
        <p>{product.description}</p>
      </div>
      <dl className="sponsor-profile-view"><div><dt>Views</dt><dd>{product.views === null ? "Unavailable" : product.views.toLocaleString("en-US")}</dd></div></dl>
      <p className="sponsor-place-note">Product profile opens</p>
      <a className="primary-button" href={product.websiteUrl} target="_blank" rel="sponsored noopener noreferrer">Visit website ↗</a>
      <p className="policy-copy">Sponsored placement</p>
    </div>
  );
}

function limitCodePoints(value: string, maximum: number) { return Array.from(value).slice(0, maximum).join(""); }

function PurchaseForm({ place, checkoutEnabled, durationCopy, onCheckout }: {
  place: SponsorPlace; checkoutEnabled: boolean; durationCopy: string; onCheckout: (checkout: Checkout) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fit, setFit] = useState<"crop" | "contain">("contain");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = formatPriceUsd(place.priceCents);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (preview) URL.revokeObjectURL(preview);
    setLogo(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!logo || busy) return;
    setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    form.set("slotId", place.slotId); form.set("logoFit", fit); form.set("logo", logo);
    try {
      const response = await fetch("/api/sponsor-placements/checkout", { method: "POST", body: form });
      const payload = await response.json() as Checkout & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "Checkout could not be started.");
      onCheckout(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not be started.");
      setBusy(false);
    }
  };
  return (
    <div className="sponsor-place-panel" data-state="free">
      <p className="sponsor-place-lead"><strong>{place.tier === "featured" ? "Featured placement" : `Sponsor spot ${place.position}`}</strong> · {price} once</p>
      <p className="journey-muted">{durationCopy}</p>
      <form className="sponsor-place-form" onSubmit={submit}>
        <label>Product URL<input name="productUrl" inputMode="url" placeholder="example.com" required autoComplete="url" /></label>
        <label>Product logo <span className="field-hint">PNG, JPEG or WebP · 1 MB max</span>
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required onChange={chooseLogo} />
        </label>
        {preview ? <div className="sponsor-upload-preview">
          <span className="sponsor-place-mark" data-size="large">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="Logo preview" className="sponsor-place-logo" data-fit={fit} /></span>
          <fieldset><legend>Logo fit</legend><label><input type="radio" checked={fit === "contain"} onChange={() => setFit("contain")} /> Fit whole logo</label><label><input type="radio" checked={fit === "crop"} onChange={() => setFit("crop")} /> Fill square</label></fieldset>
        </div> : null}
        <label>Product name
          <input name="productName" value={name} onChange={(event) => setName(limitCodePoints(event.target.value, 32))} required autoComplete="organization" />
        </label>
        <label>Short description
          <textarea name="description" value={description} onChange={(event) => setDescription(limitCodePoints(event.target.value, 160))} rows={3} required />
        </label>
        <label className="sponsor-acknowledgment"><input name="rightsConfirmed" type="checkbox" value="true" required />
          <span>I have rights to this content and accept the <a href="/sponsor-terms" target="_blank">Sponsor Terms</a> and <a href="/content-moderation" target="_blank">Content Moderation Policy</a>.</span>
        </label>
        <div className="sponsor-mini-preview" aria-label="Placement preview">
          {preview ? <span className="sponsor-place-mark">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="" className="sponsor-place-logo" data-fit={fit} /></span> : <span className="sponsor-preview-empty" />}
          <span>{name || "Your product"}</span>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {!checkoutEnabled ? <p className="sponsor-place-note" role="status">Checkout will open after the payment provider approves this placement model.</p> : null}
        <button className="primary-button" type="submit" disabled={busy || !checkoutEnabled}>{busy ? "Opening checkout…" : `Continue to checkout · ${price}`}</button>
      </form>
      <p className="policy-copy">Audience size and results are not guaranteed.</p>
    </div>
  );
}

export function SponsorPlacePanel({ place, checkoutEnabled, durationCopy, onCheckout }: {
  place: SponsorPlace; checkoutEnabled: boolean; durationCopy: string; onCheckout: (checkout: Checkout) => void;
}) {
  return place.placement ? <ProductProfile place={place} />
    : <PurchaseForm place={place} checkoutEnabled={checkoutEnabled} durationCopy={durationCopy} onCheckout={onCheckout} />;
}
