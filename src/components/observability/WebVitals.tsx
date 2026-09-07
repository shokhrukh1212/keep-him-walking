"use client";

import { useReportWebVitals } from "next/web-vitals";

function reportMetric(metric: Parameters<Parameters<typeof useReportWebVitals>[0]>[0]) {
  const body = JSON.stringify({
    id: metric.id,
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
  });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/observability/vitals", body);
  else void fetch("/api/observability/vitals", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
}

export function WebVitals() {
  useReportWebVitals(reportMetric);
  return null;
}
