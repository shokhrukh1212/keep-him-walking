import { adminClient, argument, requireApply } from "./lib";

const date = argument("date") ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD");
requireApply({ date, operation: "aggregate sponsor metrics" });
const { data, error } = await adminClient().rpc("aggregate_sponsor_metrics", { p_metric_date: date, p_now: new Date().toISOString() });
if (error) throw error;
process.stdout.write(`${JSON.stringify({ date, rows: data })}\n`);
