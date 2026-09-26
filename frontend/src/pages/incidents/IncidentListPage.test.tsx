import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeIncident, makeService, page } from "../../test/fixtures";
import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import IncidentListPage from "./IncidentListPage";

function mockList() {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get("/api/v1/services", () => HttpResponse.json(page([makeService()]))),
    http.get("/api/v1/incidents", ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return HttpResponse.json(page([makeIncident("resolved")]));
    }),
  );
  return requests;
}

describe("IncidentListPage", () => {
  it("renders incidents with severity and status badges", async () => {
    mockList();
    renderWithProviders(<IncidentListPage />, { route: "/incidents", path: "/incidents" });

    expect(await screen.findByRole("link", { name: "Elevated errors" })).toHaveAttribute(
      "href",
      "/incidents/i1",
    );
    const table = within(screen.getByRole("table"));
    expect(table.getByText("SEV2")).toBeInTheDocument();
    expect(table.getByText("Resolved")).toBeInTheDocument();
    expect(table.getByText("2h")).toBeInTheDocument(); // TTR
  });

  it("reads its filters from the URL", async () => {
    const requests = mockList();
    renderWithProviders(<IncidentListPage />, {
      route: "/incidents?status=open&status=mitigated&severity=SEV1&service=s1&q=latency",
      path: "/incidents",
    });

    await screen.findByRole("link", { name: "Elevated errors" });
    const params = requests.at(-1)!;
    expect(params.getAll("status")).toEqual(["open", "mitigated"]);
    expect(params.getAll("severity")).toEqual(["SEV1"]);
    expect(params.get("service_id")).toBe("s1");
    expect(params.get("q")).toBe("latency");
    expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("latency");
  });

  it("filters by severity and sorts by column", async () => {
    const requests = mockList();
    renderWithProviders(<IncidentListPage />, { route: "/incidents", path: "/incidents" });
    await screen.findByRole("link", { name: "Elevated errors" });
    expect(requests.at(-1)!.get("sort")).toBe("-opened_at");

    await userEvent.click(screen.getByRole("button", { name: "SEV1" }));
    expect(requests.at(-1)!.getAll("severity")).toEqual(["SEV1"]);

    await userEvent.click(screen.getByRole("button", { name: /^severity/i }));
    expect(requests.at(-1)!.get("sort")).toBe("severity");
    expect(screen.getByRole("columnheader", { name: /severity/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });
});
