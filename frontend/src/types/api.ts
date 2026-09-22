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

/** Valid next statuses per DESIGN.md §7, keyed by current status. */
export const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["mitigated", "resolved"],
  mitigated: ["open", "resolved"],
  resolved: ["open"],
};
