import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { friendlyError, untilText } from "@/lib/rate-limit";

const now = new Date("2026-01-01T18:00:00Z");

describe("untilText", () => {
  it("uses minutes under 90 and hours above", () => {
    expect(untilText(new Date("2026-01-01T18:20:00Z"), now)).toBe("in about 20 minutes");
    expect(untilText(new Date("2026-01-01T18:01:00Z"), now)).toBe("in about 1 minute");
    expect(untilText(new Date("2026-01-02T00:00:00Z"), now)).toBe("in about 6 hours");
  });
});

describe("friendlyError", () => {
  it("adds the reset time to a rate limit", () => {
    const err = new ApiError(
      429,
      "You have started all 5 reports for today.",
      "2026-01-02T00:00:00+00:00",
    );
    const text = friendlyError(err, "x", now);
    expect(text).toContain("You have started all 5 reports for today.");
    expect(text).toContain("You can start another at");
    expect(text).toContain("in about 6 hours");
  });
  it("falls back to the message, or the default for unknown errors", () => {
    expect(friendlyError(new ApiError(409, "Nope"), "x")).toBe("Nope");
    expect(friendlyError(new Error("boom"), "Try again")).toBe("Try again");
    expect(friendlyError(new ApiError(429, "Slow down", "not a date"), "x")).toBe("Slow down");
  });
});
