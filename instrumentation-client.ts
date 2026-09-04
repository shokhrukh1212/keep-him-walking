import { vemetric } from "@vemetric/web";
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0.02"),
  sendDefaultPii: false,
});

const token = process.env.NEXT_PUBLIC_VEMETRIC_TOKEN;

if (token) {
  try {
    vemetric.init({ token });
  } catch {
    // Analytics is optional and must never prevent the journey from loading.
  }
}
