import "server-only";
import { createHmac, randomUUID } from "node:crypto";

export const VISITOR_COOKIE = "khw_visitor";

export function newVisitorId(): string {
  return randomUUID();
}

export function hashOpaqueValue(value: string): string {
  const secret = process.env.VISITOR_HASH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("VISITOR_HASH_SECRET must contain at least 32 characters");
    }
    return createHmac("sha256", "phase1-development-only-secret")
      .update(value)
      .digest("hex");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
}
