import { adminClient, requireApply, requireArgument } from "./lib";

const acceptPriceMismatch = process.argv.includes("--accept-price-mismatch");

const id = requireArgument("id");
const reviewer = requireArgument("reviewer");
const supabase = adminClient();
const { data, error } = await supabase.from("sponsorships").select("id,status,private_creative_path,slot_id,tier,expected_price_cents,price_basis").eq("id", id).single();
if (error) throw error;
if (data.status !== "paid_pending_review" || !data.private_creative_path) throw new Error("Sponsor must be paid_pending_review with private creative before approval");
// The webhook flags a purchase whose day is now published at a different price.
// That is a human decision, so approval stops until someone says so explicitly.
const priceBasis = (data.price_basis ?? {}) as { mismatch?: boolean; publishedCents?: number };
if (priceBasis.mismatch && !acceptPriceMismatch) {
  throw new Error(`Paid ${data.expected_price_cents} but the day is now published at ${priceBasis.publishedCents}. Re-run with --accept-price-mismatch to approve anyway.`);
}
requireApply({ id, transition: "paid_pending_review -> approved", reviewer, creative: data.private_creative_path, tier: data.tier, priceCents: data.expected_price_cents, priceMismatchAccepted: Boolean(priceBasis.mismatch) });
const privateBucket = process.env.SUPABASE_SPONSOR_PRIVATE_BUCKET ?? "khw-sponsor-private";
const publicBucket = process.env.SUPABASE_SPONSOR_PUBLIC_BUCKET ?? "khw-sponsor-public";
const { data: creative, error: downloadError } = await supabase.storage.from(privateBucket).download(data.private_creative_path);
if (downloadError) throw downloadError;
const publicPath = `${id}/${Date.now()}-${data.private_creative_path.split("/").at(-1)}`;
const { error: uploadError } = await supabase.storage.from(publicBucket).upload(publicPath, creative, { contentType: creative.type || "image/webp", upsert: false, cacheControl: "31536000" });
if (uploadError) throw uploadError;
const now = new Date().toISOString();
const { error: updateError } = await supabase.from("sponsorships").update({ status: "approved", reviewed_at: now, approved_at: now, public_creative_path: publicPath, updated_at: now }).eq("id", id).eq("status", "paid_pending_review");
if (updateError) throw updateError;
process.stdout.write(`${JSON.stringify({ approved: true, id, reviewer, publicPath })}\n`);
