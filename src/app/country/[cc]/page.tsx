import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { countryDisplayName, flagEmoji, formatWatchDuration } from "@/lib/countries/flags";
import { countryFromHeader, UNKNOWN_COUNTRY_CODE } from "@/lib/countries/header";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ cc: string }> };

type CountryDayRow = {
  id: string;
  day_number: number;
  country_code: string;
  country_name: string;
  city_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type CountrySeason = {
  code: string;
  todayRank: number | null;
  todayWatchSeconds: number;
  todayCityName: string | null;
  seasonWatchSeconds: number;
  homeDays: CountryDayRow[];
};

/**
 * Every number here is a confirmed aggregate row. A country with no confirmed
 * watch time renders as zero rather than as an estimate.
 */
async function loadCountrySeason(code: string): Promise<CountrySeason | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;

  const { data: journey } = await supabase
    .from("journeys")
    .select("id")
    .in("status", ["preview", "active", "completed"])
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!journey) return null;

  const { data: days } = await supabase
    .from("country_days")
    .select("id,day_number,country_code,country_name,city_name,starts_at,ends_at,status")
    .eq("journey_id", journey.id)
    .order("day_number", { ascending: true });
  const seasonDays = (days ?? []) as CountryDayRow[];
  if (seasonDays.length === 0) {
    return { code, todayRank: null, todayWatchSeconds: 0, todayCityName: null, seasonWatchSeconds: 0, homeDays: [] };
  }

  const { data: watchRows } = await supabase
    .from("country_day_watch")
    .select("country_day_id,country_code,watch_seconds")
    .in("country_day_id", seasonDays.map((day) => day.id));
  const rows = (watchRows ?? []) as Array<{
    country_day_id: string;
    country_code: string;
    watch_seconds: number;
  }>;

  const liveDay = seasonDays.find((day) => day.status === "live") ?? null;
  const todayRows = liveDay
    ? rows
      .filter((row) => row.country_day_id === liveDay.id && row.watch_seconds > 0)
      .sort((a, b) => b.watch_seconds - a.watch_seconds || a.country_code.localeCompare(b.country_code))
    : [];
  const todayIndex = todayRows.findIndex((row) => row.country_code === code);

  return {
    code,
    todayRank: todayIndex >= 0 ? todayIndex + 1 : null,
    todayWatchSeconds: todayIndex >= 0 ? todayRows[todayIndex].watch_seconds : 0,
    todayCityName: liveDay?.city_name ?? null,
    seasonWatchSeconds: rows
      .filter((row) => row.country_code === code)
      .reduce((total, row) => total + Number(row.watch_seconds ?? 0), 0),
    homeDays: seasonDays.filter((day) => day.country_code === code),
  };
}

function normalizedCode(raw: string): string | null {
  const code = countryFromHeader(raw);
  return code === UNKNOWN_COUNTRY_CODE && raw.trim().toUpperCase() !== UNKNOWN_COUNTRY_CODE
    ? null
    : code;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cc } = await params;
  const code = normalizedCode(cc);
  if (!code) return { title: "Country not found — Keep Him Walking" };
  const name = countryDisplayName(code);
  const title = `${name} is keeping him walking — Keep Him Walking`;
  const description = `How much of the walk ${name} has carried this season.`;
  return { title, description, openGraph: { title, description } };
}

export default async function CountryPage({ params }: Props) {
  const { cc } = await params;
  const code = normalizedCode(cc);
  if (!code) notFound();
  const name = countryDisplayName(code);
  const season = await loadCountrySeason(code);
  const shareText = season && season.seasonWatchSeconds > 0
    ? `${flagEmoji(code)} ${name} has kept him walking for ${formatWatchDuration(season.seasonWatchSeconds)} this season.`
    : `${flagEmoji(code)} ${name} hasn’t kept him walking yet. Open the tab and he starts.`;

  return (
    <main className="content-page country-page">
      <Link className="back-link" href="/">← Return to the walk</Link>
      <span className="eyebrow">WATCHING COUNTRY</span>
      <h1><span aria-hidden="true">{flagEmoji(code)}</span> {name}</h1>

      {season === null ? (
        <p>The season aggregate is unavailable right now.</p>
      ) : (
        <>
          <section className="country-stats">
            <div>
              <span className="eyebrow">TODAY</span>
              <strong>
                {season.todayRank === null
                  ? "Not on today’s board yet"
                  : `#${season.todayRank} · ${formatWatchDuration(season.todayWatchSeconds)}`}
              </strong>
              {season.todayCityName ? <small>Carried in {season.todayCityName}</small> : null}
            </div>
            <div>
              <span className="eyebrow">THIS SEASON</span>
              <strong>{formatWatchDuration(season.seasonWatchSeconds)}</strong>
              <small>Confirmed watch time</small>
            </div>
            <div>
              <span className="eyebrow">HOME TEAM</span>
              <strong>{season.homeDays.length} {season.homeDays.length === 1 ? "day" : "days"}</strong>
              <small>Days he walked here</small>
            </div>
          </section>

          {season.homeDays.length > 0 ? (
            <section>
              <h2>Days {name} hosted the walk</h2>
              <ul className="country-home-days">
                {season.homeDays.map((day) => (
                  <li key={day.id}>
                    <strong>Day {day.day_number}</strong> · {day.city_name}
                    <span className="country-day-status">{day.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2>Share</h2>
            <p className="country-share-text">{shareText}</p>
          </section>
        </>
      )}
    </main>
  );
}
