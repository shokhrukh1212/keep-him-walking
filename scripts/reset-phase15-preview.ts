import { createClient } from "@supabase/supabase-js";

const JOURNEY_ID = "00000000-0000-4000-8000-000000000001";
const PREVIEW_SLUG = "keep-him-walking-phase15-preview";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: journey, error: lookupError } = await supabase
  .from("journeys")
  .select("id,slug")
  .eq("id", JOURNEY_ID)
  .maybeSingle();
if (lookupError) throw lookupError;
if (!journey) {
  process.stdout.write("No Phase 1.5 preview seed exists; nothing to reset.\n");
  process.exit(0);
}
if (journey.slug !== PREVIEW_SLUG) {
  throw new Error(`Refusing to delete non-preview journey ${journey.slug}`);
}

const { error: deleteError } = await supabase.from("journeys").delete().eq("id", JOURNEY_ID);
if (deleteError) throw deleteError;
process.stdout.write("Removed the reversible Phase 1.5 preview seed and its dependent rows.\n");
