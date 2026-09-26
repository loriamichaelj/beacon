import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import ServiceListPage from "./ServiceListPage";

const service = {
  id: "s1",
  name: "checkout-api",
  tier: 1,
  owner_team: "payments",
  runbook_url: null,
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  open_incident_count: 2,
};

describe("ServiceListPage", () => {
  it("renders services returned by the API", async () => {
    server.use(
      http.get("/api/v1/services", () =>
        HttpResponse.json({ items: [service], total: 1, limit: 20, offset: 0 }),
      ),
    );

    renderWithProviders(<ServiceListPage />);

    expect(await screen.findByText("checkout-api")).toBeInTheDocument();
    expect(screen.getByText("payments")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows an empty state when there are no services", async () => {
    server.use(
      http.get("/api/v1/services", () =>
        HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0 }),
      ),
    );

    renderWithProviders(<ServiceListPage />);

    expect(await screen.findByText(/no services match/i)).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    server.use(
      http.get("/api/v1/services", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Internal Server Error",
            status: 500,
            detail: "Something broke.",
            instance: "/api/v1/services",
          },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<ServiceListPage />);

    expect(await screen.findByText("Something broke.")).toBeInTheDocument();
  });

  it("filters by owner team when a team is clicked", async () => {
    const teams: (string | null)[] = [];
    server.use(
      http.get("/api/v1/services", ({ request }) => {
        teams.push(new URL(request.url).searchParams.get("owner_team"));
        return HttpResponse.json({ items: [service], total: 1, limit: 20, offset: 0 });
      }),
    );

    renderWithProviders(<ServiceListPage />);
    await userEvent.click(await screen.findByRole("button", { name: "payments" }));

    expect(await screen.findByText("Team: payments")).toBeInTheDocument();
    expect(teams.at(-1)).toBe("payments");

    await userEvent.click(screen.getByRole("button", { name: /remove team filter/i }));
    expect(screen.queryByText("Team: payments")).not.toBeInTheDocument();
    expect(teams.at(-1)).toBeNull();
  });
});
