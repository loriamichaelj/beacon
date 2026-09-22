import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
import { renderWithProviders } from "../test/utils";
import type { Service } from "../types/api";
import { ServiceForm } from "./ServiceForm";

const service: Service = {
  id: "s1",
  name: "checkout-api",
  tier: 1,
  owner_team: "payments",
  runbook_url: null,
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  open_incident_count: 0,
};

describe("ServiceForm", () => {
  it("shows validation errors for empty required fields and does not submit", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<ServiceForm submitLabel="Create service" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: /create service/i }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Owner team is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("maps 422 field errors from the API onto the matching form fields", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Unprocessable Entity",
        status: 422,
        detail: "Request validation failed.",
        instance: "/api/v1/services",
        errors: [{ loc: ["body", "name"], msg: "Service name already exists." }],
      }),
    );
    renderWithProviders(<ServiceForm submitLabel="Create service" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^name$/i), "checkout-api");
    await userEvent.type(screen.getByLabelText(/owner team/i), "payments");
    await userEvent.click(screen.getByRole("button", { name: /create service/i }));

    expect(await screen.findByText("Service name already exists.")).toBeInTheDocument();
  });

  it("submits parsed values and calls onSubmit once", async () => {
    const onSubmit = vi.fn().mockResolvedValue(service);
    renderWithProviders(<ServiceForm submitLabel="Create service" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^name$/i), "checkout-api");
    await userEvent.type(screen.getByLabelText(/owner team/i), "payments");
    await userEvent.click(screen.getByRole("button", { name: /create service/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "checkout-api",
      owner_team: "payments",
    });
  });
});
