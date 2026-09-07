import { describe, expect, it } from "vitest";
import { redactContext } from "./redaction";

describe("structured-log redaction", () => {
  it("redacts sensitive fields without destroying useful operational context", () => {
    expect(redactContext({ route: "/api/votes", visitorHash: "private", authorization: "Bearer x", status: 503 }))
      .toEqual({ route: "/api/votes", visitorHash: "[REDACTED]", authorization: "[REDACTED]", status: 503 });
  });
});
