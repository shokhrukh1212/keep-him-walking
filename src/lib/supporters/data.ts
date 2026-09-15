import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

export type PublicSupporter = {
  id: number;
  occurredAt: string;
  displayName: string;
  coffeeCount: number | null;
  xUrl: string | null;
  startupUrl: string | null;
};

export type PublicSupporterPage = {
  items: PublicSupporter[];
  hasEarlier: boolean;
};

export type AdminSupporterContribution = {
  id: number;
  source: "manual" | "buy_me_a_coffee";
  external_transaction_id: string | null;
  occurred_at: string;
  display_name: string | null;
  is_anonymous: boolean;
  coffee_count: number | null;
  x_url: string | null;
  x_verified: boolean;
  startup_url: string | null;
  startup_verified: boolean;
  private_email: string | null;
  private_payment_id: string | null;
  private_message: string | null;
  payment_verified: boolean;
  acknowledgment_permission: boolean;
  status: "draft" | "published" | "removed";
  created_at: string;
  updated_at: string;
};

export async function loadPublicSupporters(beforeAt: string | null = null, beforeId: number | null = null): Promise<PublicSupporterPage> {
  const supabase = getServerSupabase();
  if (!supabase) return { items: [], hasEarlier: false };
  const { data, error } = await supabase.rpc("read_published_supporters", {
    p_before_at: beforeAt,
    p_before_id: beforeId,
    p_limit: 20,
  });
  if (error) throw error;
  const page = data as PublicSupporterPage | null;
  return page ?? { items: [], hasEarlier: false };
}

export async function loadAdminSupporters(): Promise<AdminSupporterContribution[]> {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("supporter_contributions")
    .select("id,source,external_transaction_id,occurred_at,display_name,is_anonymous,coffee_count,x_url,x_verified,startup_url,startup_verified,private_email,private_payment_id,private_message,payment_verified,acknowledgment_permission,status,created_at,updated_at")
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as AdminSupporterContribution[];
}
