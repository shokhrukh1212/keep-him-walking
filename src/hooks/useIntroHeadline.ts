"use client";

export function useIntroHeadline(walking: boolean, enteredAtMs: number, nowMs: number) {
  return { collapsed: walking || nowMs - enteredAtMs >= 7_000 };
}
