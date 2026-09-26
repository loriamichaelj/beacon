export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Service {
  id: string;
  name: string;
  tier: number;
  owner_team: string;
  runbook_url: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  open_incident_count: number;
}

export interface ServiceCreateInput {
  name: string;
  tier: number;
  owner_team: string;
  runbook_url?: string | null;
  description?: string | null;
}

export type ServiceUpdateInput = Partial<ServiceCreateInput>;

export const INCIDENT_SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export type IncidentStatus = "open" | "mitigated" | "resolved";

export interface Incident {
  id: string;
  service_id: string;
  service_name: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  opened_at: string;
  mitigated_at: string | null;
  resolved_at: string | null;
  reopen_count: number;
  created_at: string;
  updated_at: string;
  time_to_mitigate_seconds: number | null;
  time_to_resolve_seconds: number | null;
}

export interface IncidentCreateInput {
  service_id: string;
  title: string;
  severity: IncidentSeverity;
  description?: string | null;
}

export interface IncidentUpdateInput {
  title?: string;
  description?: string | null;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
}

/** Valid next statuses per 3T-APP-DESIGN.md §7, keyed by current status. */
export const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["mitigated", "resolved"],
  mitigated: ["open", "resolved"],
  resolved: ["open"],
};

export type IncidentEventKind = "opened" | "status_changed" | "severity_changed" | "note";

/**
 * One timeline entry. `kind` decides which fields are set: `opened` carries the
 * initial severity in `to_value`; the two `*_changed` kinds use `from_value` ->
 * `to_value`; `note` carries `body`.
 */
export interface IncidentEvent {
  id: number;
  incident_id: string;
  kind: IncidentEventKind;
  from_value: string | null;
  to_value: string | null;
  body: string | null;
  created_at: string;
}

export interface ActivityEvent extends IncidentEvent {
  incident_title: string;
  incident_severity: IncidentSeverity;
  service_id: string;
  service_name: string;
}

export type SeverityCounts = Record<IncidentSeverity, number>;

export interface SeriesPoint {
  start: string;
  total: number;
  by_severity: SeverityCounts;
}

export interface Hotspot {
  service_id: string;
  service_name: string;
  tier: number;
  active: number;
  worst_severity: IncidentSeverity;
}

export interface OverviewStats {
  window: { days: number; start: string; end: string; bucket: "day" | "week" };
  active: { open: number; mitigated: number; by_severity: SeverityCounts };
  opened: number;
  opened_previous: number;
  resolved: number;
  reopened: number;
  median_time_to_mitigate_seconds: number | null;
  median_time_to_resolve_seconds: number | null;
  series: SeriesPoint[];
  hotspots: Hotspot[];
}
