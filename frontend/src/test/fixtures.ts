import type {
  ActivityEvent,
  Incident,
  IncidentEvent,
  IncidentStatus,
  OverviewStats,
  Page,
  Service,
} from "../types/api";

export function page<T>(items: T[], total = items.length): Page<T> {
  return { items, total, limit: 20, offset: 0 };
}

export function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: "s1",
    name: "checkout-api",
    tier: 1,
    owner_team: "payments",
    runbook_url: null,
    description: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    open_incident_count: 0,
    ...overrides,
  };
}

export function makeIncident(status: IncidentStatus = "open", reopenCount = 0): Incident {
  return {
    id: "i1",
    service_id: "s1",
    service_name: "checkout-api",
    title: "Elevated errors",
    description: null,
    severity: "SEV2",
    status,
    opened_at: "2026-01-01T00:00:00Z",
    mitigated_at: status !== "open" ? "2026-01-01T01:00:00Z" : null,
    resolved_at: status === "resolved" ? "2026-01-01T02:00:00Z" : null,
    reopen_count: reopenCount,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    time_to_mitigate_seconds: status !== "open" ? 3600 : null,
    time_to_resolve_seconds: status === "resolved" ? 7200 : null,
  };
}

export function makeEvent(overrides: Partial<IncidentEvent> = {}): IncidentEvent {
  return {
    id: 1,
    incident_id: "i1",
    kind: "opened",
    from_value: null,
    to_value: "SEV2",
    body: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeActivity(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    ...makeEvent(),
    incident_title: "Elevated errors",
    incident_severity: "SEV2",
    service_id: "s1",
    service_name: "checkout-api",
    ...overrides,
  };
}

const zero = { SEV1: 0, SEV2: 0, SEV3: 0, SEV4: 0 };

export function makeStats(overrides: Partial<OverviewStats> = {}): OverviewStats {
  return {
    window: {
      days: 30,
      start: "2026-08-26T00:00:00Z",
      end: "2026-09-25T00:00:00Z",
      bucket: "day",
    },
    active: { open: 0, mitigated: 0, by_severity: { ...zero } },
    opened: 0,
    opened_previous: 0,
    resolved: 0,
    reopened: 0,
    median_time_to_mitigate_seconds: null,
    median_time_to_resolve_seconds: null,
    series: [
      { start: "2026-09-24T00:00:00Z", total: 0, by_severity: { ...zero } },
      { start: "2026-09-25T00:00:00Z", total: 0, by_severity: { ...zero } },
    ],
    hotspots: [],
    ...overrides,
  };
}
