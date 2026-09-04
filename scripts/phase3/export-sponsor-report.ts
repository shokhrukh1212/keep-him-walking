import { phase2EnvironmentIdentity } from "../phase2/environment";
import { adminClient, argument } from "../phase2/lib";

await phase2EnvironmentIdentity();
const from = argument("from");
const to = argument("to");
if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Use --from YYYY-MM-DD --to YYYY-MM-DD");
const { data, error } = await adminClient().from("sponsor_daily_metrics")
  .select("metric_date,sponsorship_id,impressions,engaged_views,clicks,updated_at")
  .gte("metric_date", from).lte("metric_date", to).order("metric_date");
if (error) throw error;
process.stdout.write("metric_date,sponsorship_id,impressions,engaged_views,clicks,updated_at\n");
for (const row of data ?? []) process.stdout.write([row.metric_date, row.sponsorship_id, row.impressions, row.engaged_views, row.clicks, row.updated_at].join(",") + "\n");
