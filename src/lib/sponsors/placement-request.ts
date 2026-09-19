import { z } from "zod";

const codePoints = (value: string) => Array.from(value).length;

export function normalizeSponsorUrl(raw: string): string {
  const candidate = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
  let parsed: URL;
  try { parsed = new URL(withScheme); } catch { throw new Error("Enter a valid product website."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname.includes(".")) {
    throw new Error("Use a public HTTPS product website.");
  }
  parsed.hash = "";
  return parsed.toString();
}

export const placementRequestSchema = z.object({
  slotId: z.uuid(),
  productUrl: z.string().trim().min(1).max(500).transform((value, context) => {
    try { return normalizeSponsorUrl(value); } catch (error) {
      context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Enter a valid product website." });
      return z.NEVER;
    }
  }),
  productName: z.string().trim().min(1).refine((value) => codePoints(value) <= 32, "Product name must be 32 characters or fewer."),
  description: z.string().trim().min(1).refine((value) => codePoints(value) <= 160, "Description must be 160 characters or fewer."),
  logoFit: z.enum(["crop", "contain"]),
  rightsConfirmed: z.literal("true", { error: "Confirm your rights and accept the sponsor policies." }),
}).strict();

export function placementRequestFields(form: FormData) {
  return {
    slotId: form.get("slotId"),
    productUrl: form.get("productUrl"),
    productName: form.get("productName"),
    description: form.get("description"),
    logoFit: form.get("logoFit"),
    rightsConfirmed: form.get("rightsConfirmed"),
  };
}
