import type { AudienceCountsState, DatedCount } from "@/hooks/useOnlineVisitors";
import { DATAFAST_TRACKING_STARTED_ON } from "@/lib/analytics/datafast";

type Props = {
  counts: AudienceCountsState;
  /** The owner's public DataFast dashboard, when configured. */
  dashboardUrl: string | null;
  /** Formats an instant as a short local time, e.g. "14:32". */
  formatTime: (iso: string) => string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function trackingSince(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `since ${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

function MetricCard({ label, count, note, testId }: { label: string; count: DatedCount | null; note?: string; testId: string }) {
  return (
    <div className="audience-metric" data-testid={testId}>
      <strong className="audience-metric-value">{count ? count.value.toLocaleString("en-US") : "Unavailable"}</strong>
      <span className="audience-metric-label">{label}</span>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

/**
 * Two site-analytics cards from DataFast: activity in the last ten minutes and unique visitors
 * since tracking began (DataFast's own all-time aggregate). A failed read keeps the last good
 * numbers with their time; nothing unknown is shown as zero.
 */
export function AudienceMetrics({ counts, dashboardUrl, formatTime }: Props) {
  const { online, allTime } = counts.metrics;
  const newest = [online?.fetchedAt, allTime?.fetchedAt].filter(Boolean).sort().at(-1) ?? null;
  const updated = newest
    ? counts.failedAt
      ? `Last updated ${formatTime(newest)} · couldn’t refresh`
      : `Updated ${formatTime(newest)}`
    : counts.failedAt ? "Visitor numbers are unavailable right now." : "Loading visitor numbers…";
  return (
    <section className="audience-metrics" aria-label="Site visitors from DataFast">
      <div className="audience-metric-grid">
        <MetricCard testId="audience-active" label="Active in the last 10 minutes" count={online} note="Numbers are from the last 10 minutes." />
        <MetricCard testId="audience-all-time" label="Unique visitors · all time" count={allTime} note={trackingSince(DATAFAST_TRACKING_STARTED_ON)} />
      </div>
      <p className="audience-updated" data-testid="audience-updated">{updated}</p>
      {dashboardUrl ? (
        <a className="audience-dashboard" href={dashboardUrl} target="_blank" rel="noopener noreferrer">View public analytics on DataFast ↗</a>
      ) : null}
    </section>
  );
}
