import { describe, expect, it } from "vitest";
import { safeWebsiteUrl, seasonRequestFields, seasonSponsorRequestSchema } from "./season-request";

const valid = {
  seasonId: "6f1c5b8e-2a4d-4e7b-9c1a-3d2e1f0a9b8c",
  productName: "Acme Maps",
  website: "https://acme.example.com/walk?ref=khw",
  description: "Offline maps for walkers in 40 cities.",
  contactName: "Casey Owner",
  contactEmail: "casey@acme.example.com",
  rightsConfirmed: "true",
};

describe("sponsor website", () => {
  it("accepts only https with a real hostname", () => {
    expect(safeWebsiteUrl(" https://acme.example.com ")).toBe("https://acme.example.com/");
    expect(safeWebsiteUrl("http://acme.example.com")).toBeNull();
    expect(safeWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebsiteUrl("https://user:pass@acme.example.com")).toBeNull();
    expect(safeWebsiteUrl("https://localhost/")).toBeNull();
    expect(safeWebsiteUrl("https://192.168.0.1/")).toBeNull();
    expect(safeWebsiteUrl("https://acme example.com")).toBeNull();
    expect(safeWebsiteUrl(`https://acme.example.com/${"a".repeat(300)}`)).toBeNull();
  });
});

describe("season sponsor request", () => {
  it("accepts a complete request and normalizes the website", () => {
    const parsed = seasonSponsorRequestSchema.parse(valid);
    expect(parsed.website).toBe("https://acme.example.com/walk?ref=khw");
  });

  it("enforces the text limits and a single line of plain text", () => {
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, productName: "A" }).success).toBe(false);
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, productName: "A".repeat(61) }).success).toBe(false);
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, description: "Too short" }).success).toBe(false);
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, description: "x".repeat(141) }).success).toBe(false);
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, description: "Line one\nline two of copy" }).success).toBe(false);
  });

  it("requires rights confirmation, a real email and no extra fields", () => {
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, rightsConfirmed: "false" }).success).toBe(false);
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, contactEmail: "not-an-email" }).success).toBe(false);
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, price: "1" }).success).toBe(false);
    expect(seasonSponsorRequestSchema.safeParse({ ...valid, website: "http://acme.example.com" }).success).toBe(false);
  });

  it("reads only the known form fields", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(valid)) form.set(key, value);
    form.set("priceCents", "1");
    form.set("logo", new Blob(["x"]), "logo.png");
    expect(seasonRequestFields(form)).toEqual(valid);
  });
});
