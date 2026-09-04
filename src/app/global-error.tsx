"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body className="policy-page">
        <main><p className="eyebrow">Journey interrupted</p><h1>The road paused unexpectedly.</h1><p>No steps were invented or lost on this screen. Try reconnecting to the shared journey.</p><button onClick={reset}>Try again</button></main>
      </body>
    </html>
  );
}
