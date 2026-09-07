export const EXPERIMENTS = {
  shareCta: { id: "share-cta-v1", variants: ["share", "invite"] as const },
  tomorrowCta: { id: "tomorrow-cta-v1", variants: ["calendar", "return"] as const },
} as const;

export type ExperimentName = keyof typeof EXPERIMENTS;

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function variantFor<Name extends ExperimentName>(name: Name, opaqueSeed: string) {
  const experiment = EXPERIMENTS[name];
  return experiment.variants[stableHash(`${experiment.id}:${opaqueSeed}`) % experiment.variants.length];
}

export const NON_EXPERIMENTAL_COPY = ["walking-rule", "sponsor-disclosure", "privacy-consent", "safety"] as const;
