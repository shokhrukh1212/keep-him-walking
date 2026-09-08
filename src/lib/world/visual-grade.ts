import type { ColorMatrix } from "pixi.js";

/** Display-space multipliers, shared by Pixi's filter and Three after sRGB output. */
export type VisualGrade = { exposure: number; tint: { r: number; g: number; b: number } };

/** Screen pixels; scale is pixels per metre (the standing reference is 1.78 m). */
export type CharacterContact = { footX: number; footY: number; scale: number };
export type CharacterContacts = { traveler: CharacterContact | null; resident: CharacterContact | null };

export function gradeMatrix({ exposure, tint }: VisualGrade): ColorMatrix {
  return [
    exposure * tint.r, 0, 0, 0, 0,
    0, exposure * tint.g, 0, 0, 0,
    0, 0, exposure * tint.b, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** Ground-local coordinates: the parent scrolls by -groundScrollPx. */
export function contactShadowLayout(contact: CharacterContact, groundScrollPx: number) {
  const radiusX = 0.55 * (contact.scale * 1.78) * 0.5;
  return { x: contact.footX + groundScrollPx, y: contact.footY, radiusX, radiusY: radiusX * 0.24, alpha: 0.28 };
}
