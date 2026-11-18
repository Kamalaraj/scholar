import { describe, expect, it } from "vitest";

import { hasActiveFilters, runsQuery } from "@/lib/library-filters";

describe("runsQuery", () => {
  it("is just the page size with no filters", () => {
    expect(runsQuery(null, {})).toBe("limit=20");
  });
  it("adds cursor, trimmed search and repeated statuses", () => {
    const params = new URLSearchParams(
      runsQuery("abc", { q: "  heat pumps ", status: "in_progress" }),
    );
    expect(params.get("cursor")).toBe("abc");
    expect(params.get("q")).toBe("heat pumps");
    expect(params.getAll("status")).toEqual(["pending", "planning", "researching", "writing"]);
  });
  it("maps needs review and failed", () => {
    expect(
      new URLSearchParams(runsQuery(null, { status: "needs_review" })).getAll("status"),
    ).toEqual(["awaiting_approval"]);
    expect(new URLSearchParams(runsQuery(null, { status: "failed" })).getAll("status")).toEqual([
      "failed",
      "cancelled",
    ]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for blanks and All", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: "  ", status: "all" })).toBe(false);
    expect(hasActiveFilters({ q: "x" })).toBe(true);
    expect(hasActiveFilters({ status: "done" })).toBe(true);
  });
});
