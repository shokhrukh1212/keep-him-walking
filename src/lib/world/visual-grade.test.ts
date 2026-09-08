import { describe, expect, it } from "vitest";
import { contactShadowLayout, gradeMatrix } from "./visual-grade";

describe("shared display grade", () => {
  it("leaves alpha intact and applies the same exposure/tint per RGB channel", () => {
    expect(gradeMatrix({ exposure: 1.2, tint: { r: 1, g: 0.5, b: 0.25 } })).toEqual([
      1.2, 0, 0, 0, 0, 0, 0.6, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 1, 0,
    ]);
    expect(gradeMatrix({ exposure: 1, tint: { r: 1, g: 1, b: 1 } })).toEqual([
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ]);
  });
});

describe("ground-local contact shadow", () => {
  it.each([0, 500, 50000])("stays under the published foot after %s pixels of scroll", (scroll) => {
    const contact = { footX: 390 * 0.61, footY: 844 * 0.8, scale: 168.8 / 1.78 };
    const shadow = contactShadowLayout(contact, scroll);
    expect(shadow.x - scroll).toBeCloseTo(contact.footX);
    expect(shadow.y).toBe(contact.footY);
    expect(shadow.radiusX).toBeCloseTo(0.55 * 168.8 * 0.5);
    expect(shadow.radiusY).toBeCloseTo(shadow.radiusX * 0.24);
    expect(shadow.alpha).toBe(0.28);
  });
  it("follows a changed anchor and standing scale during conversation/resize", () => {
    const first = contactShadowLayout({ footX: 600, footY: 700, scale: 100 }, 100);
    const next = contactShadowLayout({ footX: 400, footY: 350, scale: 50 }, 100);
    expect(next.radiusX).toBe(first.radiusX / 2);
    expect(next.x).toBe(500);
    expect(next.y).toBe(350);
  });
});
