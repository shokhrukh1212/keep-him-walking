import { z } from "zod";

/**
 * A season sponsor's submission. Sponsor material is the one reviewed exception to
 * "no visitor text": it is stored privately and published only after an operator
 * approves it. Contact details are never published at all.
 */
export const SEASON_REQUEST_LIMITS = {
  productName: { min: 2, max: 60 },
  description: { min: 10, max: 140 },
  contactName: { min: 2, max: 100 },
  website: { max: 300 },
  email: { max: 254 },
} as const;

/** Line breaks, tabs and other invisible control characters (C0 and DEL). */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** An absolute https address with a real hostname, no credentials, no whitespace. */
export function safeWebsiteUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > SEASON_REQUEST_LIMITS.website.max || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname) || /^[\d.]+$/.test(url.hostname)) return null;
    const normalized = url.toString();
    return normalized.length <= SEASON_REQUEST_LIMITS.website.max ? normalized : null;
  } catch {
    return null;
  }
}

const singleLine = (min: number, max: number) => z.string()
  .refine((value) => !hasControlCharacter(value), "Use a single line of plain text.")
  .transform((value) => value.trim())
  .pipe(z.string().min(min).max(max));

export const seasonSponsorRequestSchema = z.object({
  seasonId: z.uuid(),
  productName: singleLine(SEASON_REQUEST_LIMITS.productName.min, SEASON_REQUEST_LIMITS.productName.max),
  website: z.string().transform((value, context) => {
    const safe = safeWebsiteUrl(value);
    if (!safe) {
      context.addIssue({ code: "custom", message: "Use an https:// website address." });
      return z.NEVER;
    }
    return safe;
  }),
  description: singleLine(SEASON_REQUEST_LIMITS.description.min, SEASON_REQUEST_LIMITS.description.max),
  contactName: singleLine(SEASON_REQUEST_LIMITS.contactName.min, SEASON_REQUEST_LIMITS.contactName.max),
  contactEmail: z.email().max(SEASON_REQUEST_LIMITS.email.max),
  rightsConfirmed: z.literal("true"),
}).strict();

export type SeasonSponsorRequest = z.infer<typeof seasonSponsorRequestSchema>;

/** The fields of a submitted form, without the logo file. */
export function seasonRequestFields(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of ["seasonId", "productName", "website", "description", "contactName", "contactEmail", "rightsConfirmed"]) {
    const value = form.get(key);
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}
