import { describe, expect, it } from "vitest";

import { formatRelative } from "./utils";

const now = new Date("2026-11-08T12:00:00Z");

describe("formatRelative", () => {
  it("handles recent, minute, hour and day gaps", () => {
    expect(formatRelative("2026-11-08T11:59:40Z", now)).toBe("just now");
    expect(formatRelative("2026-11-08T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelative("2026-11-08T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelative("2026-11-07T12:00:00Z", now)).toBe("yesterday");
  });
});
