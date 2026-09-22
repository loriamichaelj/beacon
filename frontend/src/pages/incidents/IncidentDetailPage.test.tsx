import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import type { Incident, IncidentStatus } from "../../types/api";
import IncidentDetailPage from "./IncidentDetailPage";

function makeIncident(status: IncidentStatus, reopenCount = 0): Incident {
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

function renderIncident(status: IncidentStatus, reopenCount = 0) {
  server.use(
    http.get("/api/v1/incidents/:id", () => HttpResponse.json(makeIncident(status, reopenCount))),
  );
  return renderWithProviders(<IncidentDetailPage />, {
    route: "/incidents/i1",
    path: "/incidents/:id",
  });
}

describe("IncidentDetailPage transition buttons", () => {
  it("shows mitigated and resolved as next states for an open incident", async () => {
    renderIncident("open");

    expect(await screen.findByRole("button", { name: /mark as mitigated/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark as resolved/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as open/i })).not.toBeInTheDocument();
  });

  it("shows open and resolved as next states for a mitigated incident", async () => {
    renderIncident("mitigated");

    expect(await screen.findByRole("button", { name: /mark as open/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark as resolved/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as mitigated/i })).not.toBeInTheDocument();
  });

  it("shows only open as the next state for a resolved incident", async () => {
    renderIncident("resolved");

    expect(await screen.findByRole("button", { name: /mark as open/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as mitigated/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as resolved/i })).not.toBeInTheDocument();
  });
});

describe("IncidentDetailPage reopen count", () => {
  it("renders the reopen count from the API response", async () => {
    renderIncident("open", 2);

    expect(await screen.findByText("Reopened")).toBeInTheDocument();
    expect(screen.getByText("2 time(s)")).toBeInTheDocument();
  });
});
