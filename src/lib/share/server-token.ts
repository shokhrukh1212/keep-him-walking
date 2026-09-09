import "server-only";
import { signShareToken, verifyShareToken, type FirstSharePayload, type SharePayload, type StepsSharePayload } from "./token";

function secret() {
  const value = process.env.VISITOR_HASH_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("VISITOR_HASH_SECRET is required for share cards");
    return "development-share-token-secret-32-characters";
  }
  return value;
}

type ShareIssuePayload = Omit<StepsSharePayload, "v" | "exp"> | Omit<FirstSharePayload, "v" | "exp">;

export function issueShareToken(payload: ShareIssuePayload, now = new Date()) {
  return signShareToken({ ...payload, v: 1, exp: Math.floor(now.getTime() / 1_000) + 86_400 } as SharePayload, secret());
}

export function readShareToken<P extends SharePayload["purpose"]>(token: string, purpose: P, now = new Date()) {
  return verifyShareToken(token, purpose, secret(), Math.floor(now.getTime() / 1_000));
}
