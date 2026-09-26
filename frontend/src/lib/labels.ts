/** What each service tier means; shown as hints wherever a tier appears. */
export const TIER_HINTS: Record<number, string> = {
  0: "Tier 0: business-critical, customer-facing",
  1: "Tier 1: important, customer-facing",
  2: "Tier 2: supporting service",
  3: "Tier 3: internal or best-effort",
};
