import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeService, makeStats, page } from "../../test/fixtures";
import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import ServiceDetailPage from "./ServiceDetailPage";

const service = makeService({ open_incident_count: 1 });

function mockServiceWithNoIncidents() {
  server.use(
    http.get("/api/v1/services/:id", () => HttpResponse.json(service)),
    http.get("/api/v1/incidents", () => HttpResponse.json(page([]))),
    http.get("/api/v1/stats/overview", () =>
      HttpResponse.json(makeStats({ opened: 3, median_time_to_resolve_seconds: 5400 })),
    ),
  );
}

function renderDetail() {
  renderWithProviders(<ServiceDetailPage />, { route: "/services/s1", path: "/services/:id" });
}

async function openDetailAndClickDelete() {
  renderDetail();
  expect(await screen.findByRole("heading", { name: "checkout-api" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
  return screen.findByRole("dialog");
}

describe("ServiceDetailPage", () => {
  it("shows the service's 30-day stats and links to report an incident for it", async () => {
    mockServiceWithNoIncidents();
    renderDetail();

    expect(await screen.findByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Opened in 30 days" })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /report incident/i })).toHaveAttribute(
      "href",
      "/incidents/new?service=s1",
    );
  });
});

describe("ServiceDetailPage delete flow", () => {
  it("requires confirmation before calling delete", async () => {
    mockServiceWithNoIncidents();
    let deleteCalled = false;
    server.use(
      http.delete("/api/v1/services/:id", () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const dialog = await openDetailAndClickDelete();
    expect(deleteCalled).toBe(false);

    await userEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(deleteCalled).toBe(false);
  });

  it("shows the server's 409 detail message when delete is blocked", async () => {
    mockServiceWithNoIncidents();
    server.use(
      http.delete("/api/v1/services/:id", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "Service has 1 incident(s) and cannot be deleted.",
            instance: "/api/v1/services/s1",
          },
          { status: 409 },
        ),
      ),
    );

    const dialog = await openDetailAndClickDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    expect(
      await screen.findByText("Service has 1 incident(s) and cannot be deleted."),
    ).toBeInTheDocument();
  });
});
