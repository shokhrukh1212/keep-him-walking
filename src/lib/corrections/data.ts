import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

export type CorrectionStatus = "new" | "accepted" | "rejected";
export type CorrectionRow = {
  id: number;
  pack_id: string;
  zone_id: string | null;
  category: "place" | "phrase" | "dialogue" | "art" | "other";
  body: string;
  country_code: string;
  status: CorrectionStatus;
  created_at: string;
  reviewed_at: string | null;
};

export async function loadCorrections(status: CorrectionStatus = "new"): Promise<CorrectionRow[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("corrections")
    .select("id,pack_id,zone_id,category,body,country_code,status,created_at,reviewed_at")
    .eq("status", status).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []) as CorrectionRow[];
}

export async function correctionContributorCount(packId: string): Promise<number> {
  const supabase = getServerSupabase();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("read_pack_correction_contributors", { p_pack_id: packId });
  if (error) return 0;
  return Number(data ?? 0);
}
