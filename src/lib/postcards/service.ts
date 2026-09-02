import "server-only";
import { randomBytes } from "node:crypto";
import { getCountryPack } from "@/content/countries/registry";
import { serverRuntimeConfig } from "@/lib/config/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { renderPostcard } from "./render";

export type PostcardResult = { token: string; url: string; imageUrl: string; idempotent: boolean };

export async function createPostcard(input: {
  countryDayId: string;
  visitorHash: string;
  origin: string;
}): Promise<PostcardResult> {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("POSTCARD_NOT_CONFIGURED");
  const config = serverRuntimeConfig();
  const [{ data: contribution }, { data: countryDay }] = await Promise.all([
    supabase.from("visitor_day_contributions").select("active_seconds").eq("country_day_id", input.countryDayId).eq("visitor_hash", input.visitorHash).maybeSingle(),
    supabase.from("country_days").select("id,day_number,scene_pack_id").eq("id", input.countryDayId).maybeSingle(),
  ]);
  if (!countryDay) throw new Error("COUNTRY_DAY_NOT_FOUND");
  const seconds = Math.floor(Number(contribution?.active_seconds ?? 0));
  if (seconds < config.postcardUnlockSeconds) throw new Error("POSTCARD_LOCKED");
  const { data: existing } = await supabase.from("postcards")
    .select("public_token,status,image_path")
    .eq("country_day_id", input.countryDayId).eq("visitor_hash", input.visitorHash).maybeSingle();
  if (existing?.status === "ready" && existing.image_path) {
    const { data: publicAsset } = supabase.storage.from(config.postcardBucket).getPublicUrl(existing.image_path);
    return { token: existing.public_token, url: `${input.origin}/p/${existing.public_token}`, imageUrl: publicAsset.publicUrl, idempotent: true };
  }

  const token = existing?.public_token ?? randomBytes(32).toString("base64url");
  if (!existing) {
    const { error: insertError } = await supabase.from("postcards").insert({
      country_day_id: input.countryDayId,
      visitor_hash: input.visitorHash,
      public_token: token,
      status: "pending",
      contribution_seconds: seconds,
      expires_at: new Date(Date.now() + config.postcardRetentionDays * 86_400_000).toISOString(),
    });
    if (insertError?.code === "23505") return createPostcard(input);
    if (insertError) throw insertError;
  } else {
    await supabase.from("postcards").update({ status: "pending", error_code: null }).eq("public_token", token);
  }
  const pack = getCountryPack(countryDay.scene_pack_id);
  if (!pack) throw new Error("COUNTRY_PACK_NOT_FOUND");
  const paths = {
    image: `${input.countryDayId}/${token}/postcard.webp`,
    openGraph: `${input.countryDayId}/${token}/og.webp`,
  };
  try {
    const rendered = await renderPostcard(pack, { dayNumber: countryDay.day_number, contributionSeconds: seconds });
    const [imageUpload, ogUpload] = await Promise.all([
      supabase.storage.from(config.postcardBucket).upload(paths.image, rendered.image, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
      supabase.storage.from(config.postcardBucket).upload(paths.openGraph, rendered.openGraph, { contentType: "image/webp", upsert: true, cacheControl: "31536000" }),
    ]);
    if (imageUpload.error || ogUpload.error) throw imageUpload.error ?? ogUpload.error;
    await supabase.from("postcards").update({
      status: "ready", image_path: paths.image, og_image_path: paths.openGraph,
      ready_at: new Date().toISOString(), error_code: null,
    }).eq("public_token", token);
    const { data: publicAsset } = supabase.storage.from(config.postcardBucket).getPublicUrl(paths.image);
    return { token, url: `${input.origin}/p/${token}`, imageUrl: publicAsset.publicUrl, idempotent: false };
  } catch (error) {
    await supabase.from("postcards").update({ status: "failed", error_code: "RENDER_OR_UPLOAD_FAILED" }).eq("public_token", token);
    throw error;
  }
}

export async function findPublicPostcard(token: string) {
  const supabase = getServerSupabase();
  if (!supabase || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data } = await supabase.from("postcards")
    .select("public_token,image_path,og_image_path,contribution_seconds,expires_at,country_days(day_number,country_name,city_name,scene_pack_id)")
    .eq("public_token", token).eq("status", "ready").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data?.image_path || !data.og_image_path) return null;
  const config = serverRuntimeConfig();
  const image = supabase.storage.from(config.postcardBucket).getPublicUrl(data.image_path).data.publicUrl;
  const openGraph = supabase.storage.from(config.postcardBucket).getPublicUrl(data.og_image_path).data.publicUrl;
  const countryDay = Array.isArray(data.country_days) ? data.country_days[0] : data.country_days;
  return { ...data, countryDay, image, openGraph };
}
