import "server-only";

import type { NextRequest } from "next/server";
import { captureOperationalError, correlationId, writeOperationalLog } from "./logger";

export function withRouteTelemetry(name: string, handler: (request: NextRequest) => Promise<Response>) {
  return async function observedRoute(request: NextRequest) {
    const started = performance.now();
    const requestId = correlationId(request);
    try {
      const response = await handler(request);
      const durationMs = Math.round(performance.now() - started);
      response.headers.set("X-Correlation-Id", requestId);
      if (response.status >= 500 || durationMs >= 800) {
        await writeOperationalLog(response.status >= 500 ? "error" : "warning", "route_completed", { route: name, method: request.method, status: response.status, durationMs, correlationId: requestId });
      }
      return response;
    } catch (error) {
      captureOperationalError(error, "route_unhandled_error", { route: name, method: request.method, correlationId: requestId });
      throw error;
    }
  };
}
