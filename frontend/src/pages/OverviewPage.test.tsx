import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeActivity, makeStats } from "../test/fixtures";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import OverviewPage from "./OverviewPage";

const stats = makeStats({
  active: { open: 3, mitigated: 1, by_severity: { SEV1: 1, SEV2: 2, SEV3: 0, SEV4: 1 } },
  opened: 6,
  opened_previous: 4,
  resolved: 5,
  reopened: 3,
  median_time_to_mitigate_seconds: 1800,
  median_time_to_resolve_seconds: 7200,
  series: [
    {
      start: "2026-09-24T00:00:00Z",
      total: 2,
      by_severity: { SEV1: 1, SEV2: 1, SEV3: 0, SEV4: 0 },
    },
    {
      start: "2026-09-25T00:00:00Z",
      total: 4,
      by_severity: { SEV1: 0, SEV2: 1, SEV3: 2, SEV4: 1 },
    },
  ],
  hotspots: [
    { service_id: "s1", service_name: "checkout-api", tier: 0, active: 2, worst_severity: "SEV1" },
  ],
});

function mockOverview(onStats?: (url: URL) => void) {
  server.use(
    http.get("/api/v1/stats/overview", ({ request }) => {
      onStats?.(new URL(request.url));
      return HttpResponse.json(stats);
    }),
    http.get("/api/v1/activity", () =>
      HttpResponse.json([
        makeActivity({ id: 2, kind: "note", body: "Scaled out.", to_value: null }),
        makeActivity({ id: 1, kind: "status_changed", from_value: "open", to_value: "mitigated" }),
      ]),
    ),
  );
}

describe("OverviewPage", () => {
  it("shows the headline numbers", async () => {
    mockOverview();
    renderWithProviders(<OverviewPage />);

    const unresolved = await screen.findByRole("article", { name: "Unresolved incidents" });
    expect(unresolved).toHaveTextContent("4");
    expect(unresolved).toHaveTextContent("3 open · 1 mitigated");
    expect(screen.getByRole("article", { name: "Opened in 30 days" })).toHaveTextContent(
      "▲ 2 vs the previous 30 days",
    );
    expect(screen.getByRole("article", { name: "Median time to mitigate" })).toHaveTextContent(
      "30m",
    );
    expect(screen.getByRole("article", { name: "Reopen rate" })).toHaveTextContent("50%");
  });

  it("gives the chart's numbers as a table", async () => {
    mockOverview();
    renderWithProviders(<OverviewPage />);

    const table = await screen.findByRole("table", { name: /incidents opened per day/i });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 days
    expect(
      within(rows[2])
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["0", "1", "2", "1", "4"]);
  });

  it("lists hotspots and recent activity", async () => {
    mockOverview();
    renderWithProviders(<OverviewPage />);

    expect(await screen.findByRole("link", { name: "checkout-api" })).toHaveAttribute(
      "href",
      "/services/s1",
    );
    expect(await screen.findByText(/“Scaled out\.”/)).toBeInTheDocument();
    expect(screen.getByText(/Marked mitigated/)).toBeInTheDocument();
  });

  it("switches the time window", async () => {
    const requested: string[] = [];
    mockOverview((url) => requested.push(url.searchParams.get("days") ?? ""));
    renderWithProviders(<OverviewPage />);

    await screen.findByRole("article", { name: "Unresolved incidents" });
    await userEvent.click(screen.getByRole("button", { name: "7 days" }));

    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(requested).toEqual(["30", "7"]);
  });
});
