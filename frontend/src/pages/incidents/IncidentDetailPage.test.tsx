import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { makeEvent, makeIncident, makeService, page } from "../../test/fixtures";
import { server } from "../../test/server";
import { renderWithProviders } from "../../test/utils";
import type { IncidentEvent, IncidentStatus } from "../../types/api";
import IncidentDetailPage from "./IncidentDetailPage";

function renderIncident(
  status: IncidentStatus,
  reopenCount = 0,
  events: IncidentEvent[] = [makeEvent()],
) {
  server.use(
    http.get("/api/v1/incidents/:id", () => HttpResponse.json(makeIncident(status, reopenCount))),
    http.get("/api/v1/incidents/:id/events", () => HttpResponse.json(page(events))),
    http.get("/api/v1/services/:id", () =>
      HttpResponse.json(makeService({ runbook_url: "https://runbooks.example.com/checkout" })),
    ),
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

  it("sends the transition and confirms it", async () => {
    let body: unknown;
    server.use(
      http.patch("/api/v1/incidents/:id", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeIncident("mitigated"));
      }),
    );
    renderIncident("open");

    await userEvent.click(await screen.findByRole("button", { name: /mark as mitigated/i }));

    expect(await screen.findByText("Incident marked mitigated.")).toBeInTheDocument();
    expect(body).toEqual({ status: "mitigated" });
  });
});

describe("IncidentDetailPage details", () => {
  it("renders the reopen count and the service's runbook", async () => {
    renderIncident("open", 2);

    expect(await screen.findByText("2 time(s)")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /open runbook/i })).toHaveAttribute(
      "href",
      "https://runbooks.example.com/checkout",
    );
  });
});

describe("IncidentDetailPage timeline", () => {
  it("describes each event", async () => {
    renderIncident("mitigated", 0, [
      makeEvent({ id: 1 }),
      makeEvent({ id: 2, kind: "severity_changed", from_value: "SEV3", to_value: "SEV1" }),
      makeEvent({ id: 3, kind: "status_changed", from_value: "open", to_value: "mitigated" }),
      makeEvent({ id: 4, kind: "note", to_value: null, body: "Rolled back the deploy." }),
    ]);

    const timeline = within(await screen.findByRole("list"));
    expect(timeline.getByText("Opened as SEV2")).toBeInTheDocument();
    expect(timeline.getByText("Escalated from SEV3 to SEV1")).toBeInTheDocument();
    expect(timeline.getByText("Marked mitigated")).toBeInTheDocument();
    expect(timeline.getByText("Rolled back the deploy.")).toBeInTheDocument();
  });

  it("posts a trimmed note and clears the box", async () => {
    let posted: unknown;
    server.use(
      http.post("/api/v1/incidents/:id/events", async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(makeEvent({ id: 9, kind: "note", body: "Paged on-call." }), {
          status: 201,
        });
      }),
    );
    renderIncident("open");

    const box = await screen.findByLabelText(/add a note/i);
    const submit = screen.getByRole("button", { name: /add note/i });
    expect(submit).toBeDisabled();

    await userEvent.type(box, "  Paged on-call.  ");
    await userEvent.click(submit);

    expect(await screen.findByText("Note added.")).toBeInTheDocument();
    expect(posted).toEqual({ body: "Paged on-call." });
    expect(box).toHaveValue("");
  });
});

describe("IncidentDetailPage edit", () => {
  it("saves title and severity changes", async () => {
    let body: unknown;
    server.use(
      http.patch("/api/v1/incidents/:id", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeIncident("open"));
      }),
    );
    renderIncident("open");

    await userEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
    const dialog = within(await screen.findByRole("dialog"));
    const title = dialog.getByLabelText(/title/i);
    await userEvent.clear(title);
    await userEvent.type(title, "Checkout 502s");
    await userEvent.click(dialog.getByRole("radio", { name: /SEV1/ }));
    await userEvent.click(dialog.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(body).toEqual({ title: "Checkout 502s", severity: "SEV1", description: null }),
    );
    expect(await screen.findByText("Incident updated.")).toBeInTheDocument();
  });
});
