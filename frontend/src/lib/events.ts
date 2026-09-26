import type { IconName } from "../components/Icon";
import { INCIDENT_SEVERITIES, type IncidentEvent } from "../types/api";

/** One-line, human description of a timeline event (notes use their body instead). */
export function describeEvent(event: IncidentEvent): string {
  switch (event.kind) {
    case "opened":
      return `Opened as ${event.to_value}`;
    case "status_changed":
      if (event.to_value === "open") return `Reopened (was ${event.from_value})`;
      return `Marked ${event.to_value}`;
    case "severity_changed": {
      const from = INCIDENT_SEVERITIES.indexOf(event.from_value as never);
      const to = INCIDENT_SEVERITIES.indexOf(event.to_value as never);
      const verb = to < from ? "Escalated" : "Downgraded";
      return `${verb} from ${event.from_value} to ${event.to_value}`;
    }
    case "note":
      return "Added a note";
  }
}

export function eventIcon(event: IncidentEvent): IconName {
  switch (event.kind) {
    case "opened":
      return "opened";
    case "severity_changed":
      return "severity";
    case "note":
      return "note";
    case "status_changed":
      return event.to_value === "mitigated"
        ? "mitigate"
        : event.to_value === "resolved"
          ? "resolve"
          : "reopen";
  }
}

/** A tone for the event's marker, matching the status it moved to. */
export function eventTone(event: IncidentEvent): string {
  if (event.kind === "status_changed") return `tone-${event.to_value}`;
  if (event.kind === "severity_changed") return "tone-severity";
  if (event.kind === "opened") return "tone-open";
  return "tone-note";
}
