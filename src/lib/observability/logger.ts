import "server-only";

import * as Sentry from "@sentry/nextjs";
import { redactContext } from "./redaction";

type Level = "info" | "warning" | "error";
type Context = Record<string, unknown>;

export function correlationId(request?: Request) {
  return request?.headers.get("x-vercel-id") || request?.headers.get("x-request-id") || crypto.randomUUID();
}

export async function writeOperationalLog(level: Level, event: string, context: Context = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "keep-him-walking",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    ...redactContext(context),
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warning") console.warn(line);
  else console.info(line);

  const sourceToken = process.env.BETTER_STACK_SOURCE_TOKEN;
  if (!sourceToken) return;
  try {
    await fetch(process.env.BETTER_STACK_INGEST_URL || "https://in.logs.betterstack.com", {
      method: "POST",
      headers: { Authorization: `Bearer ${sourceToken}`, "Content-Type": "application/json" },
      body: line,
      signal: AbortSignal.timeout(1_500),
    });
  } catch {
    // Observability must never change product behavior.
  }
}

export function captureOperationalError(error: unknown, event: string, context: Context = {}) {
  Sentry.captureException(error, { tags: { event }, extra: redactContext(context) });
  void writeOperationalLog("error", event, {
    ...context,
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: error instanceof Error ? error.message : "Unknown error",
  });
}
