import "server-only";

import {
  SEASON_SPONSOR_CURRENCY,
  SEASON_SPONSOR_PRICE_CENTS,
  SEASON_SPONSOR_PRICES_CENTS,
  featuredSponsorPriceCents,
  seasonCheckoutState,
  seasonPriceIncludesTax,
  seasonSaleCutoffHours,
  seasonSponsorXUrl,
} from "@/lib/config/sponsorship";
import { serverRuntimeConfig } from "@/lib/config/server";
import { seasonPhaseAt } from "@/lib/season/clock";
import { loadSeasons, seasonSponsorFor } from "@/lib/season/state";
import { getServerSupabase } from "@/lib/supabase/server";
import { earliestEligibleSeason, saleClosesAt } from "./season-offer";

export type SeasonOffer = {
  season: {
    id: string;
    number: number;
    title: string;
    startsAt: string;
    endsAt: string;
    saleClosesAt: string;
    cities: string[];
  } | null;
  priceCents: number;
  currency: string;
  priceIncludesTax: boolean;
  cutoffHours: number;
  checkout: "enabled" | "request_only";
  pricing: Array<{ number: number; priceCents: number; startsAt: string | null; endsAt: string | null }>;
  ownerXUrl: string | null;
  /** The incumbent may be replaced at twice this server-confirmed price. */
  currentSponsor: { name: string; seasonNumber: number; priceCents: number } | null;
};

const PAID = ["scheduled", "active", "completed"];

/** The single season on offer, or none. Small, public and safe to cache briefly. */
export async function loadSeasonOffer(now = new Date()): Promise<SeasonOffer> {
  const base: SeasonOffer = {
    season: null,
    priceCents: SEASON_SPONSOR_PRICE_CENTS,
    currency: SEASON_SPONSOR_CURRENCY,
    priceIncludesTax: seasonPriceIncludesTax(),
    cutoffHours: seasonSaleCutoffHours(),
    checkout: "request_only",
    pricing: Object.entries(SEASON_SPONSOR_PRICES_CENTS).map(([number, priceCents]) => ({
      number: Number(number), priceCents, startsAt: null, endsAt: null,
    })),
    ownerXUrl: seasonSponsorXUrl(),
    currentSponsor: null,
  };
  const supabase = getServerSupabase();
  if (!supabase) return base;
  const seasons = await loadSeasons(supabase);
  const { data: configuredPrices, error: priceError } = await supabase.from("season_sponsor_prices")
    .select("season_number,price_cents").in("season_number", [1, 2, 3]).order("season_number", { ascending: true });
  if (priceError) throw priceError;
  const priceBySeason = new Map((configuredPrices ?? []).map((row) => [Number(row.season_number), Number(row.price_cents)]));
  const pricing = base.pricing.map((entry) => {
    const configured = seasons.find((season) => season.number === entry.number);
    return {
      ...entry,
      priceCents: priceBySeason.get(entry.number) ?? entry.priceCents,
      startsAt: configured?.startsAt ?? null,
      endsAt: configured?.endsAt ?? null,
    };
  });
  if (!seasons.length) return { ...base, pricing };
  const { data: paid, error } = await supabase.from("season_sponsorships")
    .select("journey_id,product_name,price_cents,status").in("status", PAID).in("journey_id", seasons.map((season) => season.id));
  if (error) throw error;
  const eligible = earliestEligibleSeason(
    seasons.filter((season) => priceBySeason.has(season.number)).map((season) => ({ ...season, cities: [] })),
    new Set(),
    now.getTime(),
    base.cutoffHours,
  );
  let cities: string[] = [];
  if (eligible) {
    const { data: days, error: dayError } = await supabase.from("country_days")
      .select("city_name,day_number").eq("journey_id", eligible.id).order("day_number", { ascending: true });
    if (dayError) throw dayError;
    cities = (days ?? []).map((day) => String(day.city_name));
  }
  const phase = seasonPhaseAt(seasons, now.getTime());
  const sponsor = phase.kind === "live" ? await seasonSponsorFor(supabase, phase.current, "live") : null;
  const currentPayment = eligible
    ? (paid ?? []).find((row) => String(row.journey_id) === eligible.id && ["scheduled", "active"].includes(String(row.status)))
    : null;
  return {
    ...base,
    priceCents: eligible ? featuredSponsorPriceCents(currentPayment ? Number(currentPayment.price_cents) : null) : base.priceCents,
    checkout: eligible && seasonCheckoutState(process.env, eligible.number).enabled ? "enabled" : "request_only",
    pricing,
    season: eligible ? {
      id: eligible.id,
      number: eligible.number,
      title: eligible.title,
      startsAt: eligible.startsAt,
      endsAt: eligible.endsAt,
      saleClosesAt: saleClosesAt(eligible.startsAt, base.cutoffHours),
      cities,
    } : null,
    currentSponsor: sponsor ? {
      name: sponsor.name,
      seasonNumber: sponsor.seasonNumber,
      priceCents: currentPayment ? Number(currentPayment.price_cents) : base.priceCents,
    } : null,
  };
}

/** The sponsor a running or finished season acknowledges on its recap, by season number. */
export async function seasonSponsorAcknowledgment(seasonNumber: number) {
  const supabase = getServerSupabase();
  if (!supabase || !Number.isInteger(seasonNumber) || seasonNumber < 1) return null;
  const { data: journey, error } = await supabase.from("journeys")
    .select("id,season_number")
    .not("ends_at", "is", null)
    .eq("season_number", seasonNumber)
    .in("status", ["active", "completed"])
    .maybeSingle();
  if (error || !journey) return null;
  return seasonSponsorFor(supabase, { id: String(journey.id), number: Number(journey.season_number) }, "completed");
}

export type SeasonRequestView = {
  publicId: string;
  status: string;
  statusReason: string | null;
  productName: string;
  description: string;
  websiteUrl: string;
  priceCents: number;
  holdExpiresAt: string | null;
  season: { number: number; title: string; startsAt: string; endsAt: string; saleClosesAt: string };
  checkoutAvailable: boolean;
  bookingClosed: boolean;
  seasonAvailable: boolean;
  scheduleChanged: boolean;
  quoteChanged: boolean;
  /** Approved, still sellable, and real checkout is switched on. */
  payable: boolean;
};

/** A requester's own view, reached only through the unguessable reference they were given. */
export async function loadSeasonRequest(publicId: string, now = new Date()): Promise<SeasonRequestView | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.from("season_sponsorships")
    .select("id,public_id,journey_id,status,status_reason,product_name,description,website_url,price_cents,hold_expires_at,quoted_starts_at,quoted_ends_at,journeys(season_number,title,starts_at,ends_at)")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const season = (Array.isArray(data.journeys) ? data.journeys[0] : data.journeys) as {
    season_number: number; title: string; starts_at: string; ends_at: string;
  } | null;
  if (!season) return null;
  const closesAt = season.ends_at;
  const checkoutAvailable = seasonCheckoutState(process.env, Number(season.season_number)).enabled;
  const bookingClosed = Date.parse(closesAt) <= now.getTime();
  const scheduleChanged = Date.parse(String(data.quoted_starts_at)) !== Date.parse(season.starts_at)
    || Date.parse(String(data.quoted_ends_at)) !== Date.parse(season.ends_at);
  const { data: incumbent, error: paidError } = await supabase.from("season_sponsorships")
    .select("price_cents").eq("journey_id", String(data.journey_id)).neq("id", String(data.id))
    .in("status", ["scheduled", "active"]).maybeSingle();
  if (paidError) throw paidError;
  const quoteChanged = Number(data.price_cents) !== featuredSponsorPriceCents(incumbent ? Number(incumbent.price_cents) : null);
  const seasonAvailable = Date.parse(season.ends_at) > now.getTime();
  return {
    publicId: String(data.public_id),
    status: String(data.status),
    statusReason: data.status_reason ?? null,
    productName: String(data.product_name),
    description: String(data.description),
    websiteUrl: String(data.website_url),
    priceCents: Number(data.price_cents),
    holdExpiresAt: data.hold_expires_at ?? null,
    season: {
      number: Number(season.season_number),
      title: season.title,
      startsAt: season.starts_at,
      endsAt: season.ends_at,
      saleClosesAt: closesAt,
    },
    checkoutAvailable,
    bookingClosed,
    seasonAvailable,
    scheduleChanged,
    quoteChanged,
    payable: String(data.status) === "approved"
      && !bookingClosed
      && !scheduleChanged
      && !quoteChanged
      && seasonAvailable
      && checkoutAvailable,
  };
}

export type AdminSeasonBooking = {
  id: string;
  publicId: string;
  status: string;
  statusReason: string | null;
  productName: string;
  description: string;
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  priceCents: number;
  continuationUrl: string;
  privateLogoUrl: string | null;
  publicLogoUrl: string | null;
  season: { number: number; startsAt: string; endsAt: string };
  provider: string | null;
  testMode: boolean;
  providerPaymentId: string | null;
  holdExpiresAt: string | null;
  submittedAt: string;
  paidAt: string | null;
  deliveredFrom: string | null;
  deliveredUntil: string | null;
  refundedAt: string | null;
  payments: Array<{ paymentId: string; outcome: string; reason: string | null; amountCents: number | null; taxCents: number | null; disputeState: string | null }>;
  metrics: { impressions: number; clicks: number } | null;
};

/** The private operations list. Contact details and unreviewed logos appear only here. */
export async function loadAdminSeasonBookings(): Promise<AdminSeasonBooking[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const config = serverRuntimeConfig();
  const { data, error } = await supabase.from("season_sponsorships")
    .select("id,public_id,status,status_reason,product_name,description,website_url,contact_name,contact_email,price_cents,private_logo_path,public_logo_path,provider,test_mode,provider_payment_id,hold_expires_at,submitted_at,paid_at,delivered_from,delivered_until,refunded_at,journeys(season_number,starts_at,ends_at)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.map((row) => String(row.id));
  const [{ data: signed }, { data: payments, error: paymentError }] = await Promise.all([
    rows.length
      ? supabase.storage.from(config.sponsorPrivateBucket).createSignedUrls(rows.map((row) => String(row.private_logo_path)), 3_600)
      : Promise.resolve({ data: [] as Array<{ path: string | null; signedUrl: string }> }),
    ids.length
      ? supabase.from("season_sponsor_payments").select("season_sponsorship_id,payment_id,outcome,reason,amount_cents,tax_cents,dispute_state").in("season_sponsorship_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (paymentError) throw paymentError;
  let publicOrigin = "https://keephimwalking.com";
  try {
    publicOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || publicOrigin).origin;
  } catch {
    // The canonical public origin is safer than producing an unusable continuation link.
  }
  const signedByPath = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl]));
  const delivered = rows.filter((row) => ["active", "completed", "cancelled", "refunded"].includes(String(row.status)) && row.delivered_from);
  const metrics = new Map<string, { impressions: number; clicks: number }>();
  for (const row of delivered) {
    const count = async (eventType: string) => {
      const { count: total } = await supabase.from("season_sponsor_metric_events")
        .select("dedupe_key", { count: "exact", head: true })
        .eq("season_sponsorship_id", row.id).eq("event_type", eventType);
      return total ?? 0;
    };
    const [impressions, clicks] = await Promise.all([count("impression"), count("cta_click")]);
    metrics.set(String(row.id), { impressions, clicks });
  }
  return rows.map((row) => {
    const season = (Array.isArray(row.journeys) ? row.journeys[0] : row.journeys) as { season_number: number; starts_at: string; ends_at: string } | null;
    return {
      id: String(row.id),
      publicId: String(row.public_id),
      status: String(row.status),
      statusReason: row.status_reason ?? null,
      productName: String(row.product_name),
      description: String(row.description),
      websiteUrl: String(row.website_url),
      contactName: String(row.contact_name),
      contactEmail: String(row.contact_email),
      priceCents: Number(row.price_cents),
      continuationUrl: `${publicOrigin}/sponsors/request/${row.public_id}`,
      privateLogoUrl: signedByPath.get(String(row.private_logo_path)) ?? null,
      publicLogoUrl: row.public_logo_path
        ? supabase.storage.from(config.sponsorPublicBucket).getPublicUrl(String(row.public_logo_path)).data.publicUrl
        : null,
      season: { number: Number(season?.season_number ?? 0), startsAt: season?.starts_at ?? "", endsAt: season?.ends_at ?? "" },
      provider: row.provider ?? null,
      testMode: Boolean(row.test_mode),
      providerPaymentId: row.provider_payment_id ?? null,
      holdExpiresAt: row.hold_expires_at ?? null,
      submittedAt: String(row.submitted_at),
      paidAt: row.paid_at ?? null,
      deliveredFrom: row.delivered_from ?? null,
      deliveredUntil: row.delivered_until ?? null,
      refundedAt: row.refunded_at ?? null,
      payments: (payments ?? [])
        .filter((payment) => String(payment.season_sponsorship_id) === String(row.id))
        .map((payment) => ({
          paymentId: String(payment.payment_id),
          outcome: String(payment.outcome),
          reason: payment.reason ?? null,
          amountCents: payment.amount_cents === null ? null : Number(payment.amount_cents),
          taxCents: payment.tax_cents === null ? null : Number(payment.tax_cents),
          disputeState: payment.dispute_state ?? null,
        })),
      metrics: metrics.get(String(row.id)) ?? null,
    };
  });
}
