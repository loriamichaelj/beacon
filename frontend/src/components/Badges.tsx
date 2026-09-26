/** Severity, status, and tier badges: always text; color is only a cue. */
import { capitalize } from "../lib/format";
import { TIER_HINTS } from "../lib/labels";
import type { IncidentSeverity, IncidentStatus } from "../types/api";

export function SeverityBadge({ severity }: { severity: IncidentSeverity | string }) {
  return <span className={`badge sev-badge sev-${severity}`}>{severity}</span>;
}

export function StatusBadge({ status }: { status: IncidentStatus | string }) {
  return (
    <span className={`badge status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {capitalize(status)}
    </span>
  );
}

export function TierBadge({ tier }: { tier: number }) {
  return (
    <span className={`badge tier-badge tier-${tier}`} title={TIER_HINTS[tier]}>
      Tier {tier}
    </span>
  );
}
