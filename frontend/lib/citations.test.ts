import { describe, expect, it } from "vitest";

import { allowCitationUrls, citationNumber, linkCitations } from "@/lib/citations";

describe("linkCitations", () => {
  it("links only citations that match a source", () => {
    const out = linkCitations("Claim [1] and [2], but not [9].", new Set([1, 2]));
    expect(out).toBe("Claim [1](cite:1) and [2](cite:2), but not [9].");
  });
  it("leaves existing links and footnote-style text alone", () => {
    const text = "See [1](https://x.org) and [2]: note";
    expect(linkCitations(text, new Set([1, 2]))).toBe(text);
  });
  it("handles adjacent citations", () => {
    expect(linkCitations("A [1][2].", new Set([1, 2]))).toBe("A [1](cite:1)[2](cite:2).");
  });
});

describe("citationNumber / allowCitationUrls", () => {
  it("reads cite links only", () => {
    expect(citationNumber("cite:3")).toBe(3);
    expect(citationNumber("cite:x")).toBeNull();
    expect(citationNumber("https://x.org")).toBeNull();
    expect(citationNumber(undefined)).toBeNull();
  });
  it("blocks javascript: and data: urls", () => {
    expect(allowCitationUrls("cite:1")).toBe("cite:1");
    expect(allowCitationUrls("https://x.org/a")).toBe("https://x.org/a");
    expect(allowCitationUrls("javascript:alert(1)")).toBe("");
    expect(allowCitationUrls("data:text/html,x")).toBe("");
  });
});
