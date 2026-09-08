export type CharacterHeightTargets = Readonly<{
  desktop: number;
  mobile: number;
}>;

export const DEFAULT_CHARACTER_HEIGHT_TARGETS: CharacterHeightTargets = Object.freeze({
  desktop: 0.24,
  mobile: 0.20,
});

function fraction(value: string | undefined, fallback: number, name: string) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new RangeError(`${name} must be a number greater than 0 and at most 1`);
  }
  return parsed;
}

/** Pure parsing shared by Next build configuration and command-line diagnostics. */
export function characterHeightTargetsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): CharacterHeightTargets {
  return {
    desktop: fraction(
      env.TARGET_CHARACTER_HEIGHT_FRAC,
      DEFAULT_CHARACTER_HEIGHT_TARGETS.desktop,
      "TARGET_CHARACTER_HEIGHT_FRAC",
    ),
    mobile: fraction(
      env.TARGET_CHARACTER_HEIGHT_FRAC_MOBILE,
      DEFAULT_CHARACTER_HEIGHT_TARGETS.mobile,
      "TARGET_CHARACTER_HEIGHT_FRAC_MOBILE",
    ),
  };
}

/** Build-time public presentation values. They contain no secret data. */
export const CHARACTER_HEIGHT_TARGETS = characterHeightTargetsFromEnv({
  TARGET_CHARACTER_HEIGHT_FRAC: process.env.TARGET_CHARACTER_HEIGHT_FRAC,
  TARGET_CHARACTER_HEIGHT_FRAC_MOBILE: process.env.TARGET_CHARACTER_HEIGHT_FRAC_MOBILE,
});

export function targetCharacterHeightPx(
  viewportWidth: number,
  viewportHeight: number,
  targets: CharacterHeightTargets,
) {
  return viewportHeight * (viewportWidth <= 600 ? targets.mobile : targets.desktop);
}
