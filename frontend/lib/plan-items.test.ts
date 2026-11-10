import { describe, expect, it } from "vitest";

import { approvalBlocker, moveItem, textError, toPayload } from "@/lib/plan-items";

const item = (text: string, id = text) => ({ id, text, reason: null });

describe("moveItem", () => {
  it("moves an item down and up", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });
  it("ignores moves past either end", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 1, 2)).toBe(items);
  });
});

describe("approvalBlocker", () => {
  it("blocks an empty plan", () => {
    expect(approvalBlocker([])).toMatch(/at least one/i);
  });
  it("blocks short or long text and more than 8 items", () => {
    expect(approvalBlocker([item("abc")])).toMatch(/fix/i);
    expect(approvalBlocker([item("x".repeat(301))])).toMatch(/fix/i);
    expect(approvalBlocker(Array.from({ length: 9 }, (_, i) => item(`Angle number ${i}`)))).toMatch(
      /at most 8/,
    );
  });
  it("allows a valid plan", () => {
    expect(approvalBlocker([item("A good angle")])).toBeNull();
  });
});

describe("textError / toPayload", () => {
  it("trims before checking", () => {
    expect(textError("  abc  ")).not.toBeNull();
    expect(textError("  abcde  ")).toBeNull();
  });
  it("sends trimmed text without ids", () => {
    expect(toPayload([item("  Padded angle  ", "x")])).toEqual([
      { text: "Padded angle", reason: null },
    ]);
  });
});
