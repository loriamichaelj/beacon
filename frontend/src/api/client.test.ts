import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../test/server";
import { apiRequest } from "./client";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function captureRequestId(): { value: () => string | null } {
  let seen: string | null = null;
  server.use(
    http.get("*/api/v1/ping", ({ request }) => {
      seen = request.headers.get("X-Request-ID");
      return HttpResponse.json({ ok: true });
    }),
  );
  return { value: () => seen };
}

describe("apiRequest X-Request-ID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a UUID v4 request ID", async () => {
    const captured = captureRequestId();
    await apiRequest("/ping");
    expect(captured.value()).toMatch(UUID_V4);
  });

  // Browsers only expose crypto.randomUUID in secure contexts (HTTPS or
  // localhost). Over plain HTTP, e.g. an ALB DNS name before TLS is set up,
  // it's undefined and every API call used to throw.
  it("still sends a UUID v4 request ID when crypto.randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    const captured = captureRequestId();
    await apiRequest("/ping");
    expect(captured.value()).toMatch(UUID_V4);
  });
});
