import { describe, expect, it } from "vitest";

import { formatDuration, formatPercent, formatRelative, NO_VALUE, plural } from "./format";

describe("formatDuration", () => {
  it.each([
    [null, NO_VALUE],
    [42, "42s"],
    [60 * 12, "12m"],
    [3600 * 3, "3h"],
    [3600 * 3 + 60 * 20, "3h 20m"],
    [3600 * 52, "2d 4h"],
    [3600 * 48, "2d"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  it("says just now for the last few seconds", () => {
    expect(formatRelative("2026-09-25T11:59:40Z", now)).toBe("just now");
  });

  it("uses the largest whole unit", () => {
    expect(formatRelative("2026-09-25T09:00:00Z", now)).toMatch(/3 hours ago/);
    expect(formatRelative("2026-09-25T11:30:00Z", now)).toMatch(/30 minutes ago/);
  });
});

describe("formatPercent and plural", () => {
  it("renders missing rates as an em dash", () => {
    expect(formatPercent(null)).toBe(NO_VALUE);
    expect(formatPercent(0.254)).toBe("25%");
  });

  it("pluralizes", () => {
    expect(plural(1, "incident")).toBe("1 incident");
    expect(plural(3, "incident")).toBe("3 incidents");
  });
});
