import { describe, expect, it } from "vitest";

import { applyEvent, deriveStages, emptyView, reduceEvents, type RunEvent } from "@/lib/run-events";

let seq = 0;
const ev = (type: string, payload: Record<string, unknown> = {}, s = ++seq): RunEvent => ({
  seq: s,
  type,
  payload,
  created_at: "2026-01-01T10:00:00Z",
});

describe("applyEvent", () => {
  it("ignores events it has already seen", () => {
    const first = applyEvent(emptyView, ev("status", { status: "planning" }, 1));
    const again = applyEvent(first, ev("status", { status: "planning" }, 1));
    expect(again).toBe(first);
  });

  it("builds lanes from tool calls and sources", () => {
    const view = reduceEvents([
      ev(
        "plan_ready",
        {
          items: [
            { text: "A?", reason: null },
            { text: "B?", reason: "r" },
          ],
        },
        1,
      ),
      ev("tool_call", { index: 1, tool: "search", query: "q" }, 2),
      ev("tool_call", { index: 1, tool: "read", url: "https://www.x.org/a" }, 3),
      ev(
        "source_found",
        { index: 1, url: "https://x.org/a", title: "T", domain: "x.org", quote: "Q" },
        4,
      ),
      ev("node_end", { node: "research", index: 1 }, 5),
    ]);
    expect(view.plan).toHaveLength(2);
    expect(view.lanes[1]).toMatchObject({ phase: "done", queries: ["q"], pagesRead: 1 });
    expect(view.lanes[0].phase).toBe("waiting");
    expect(view.sourceCount).toBe(1);
    expect(view.activity.map((a) => a.text)).toContain("Read x.org");
  });

  it("records failures", () => {
    const view = reduceEvents([ev("run_failed", { error: "boom" }, 1)]);
    expect(view.error).toBe("boom");
    expect(view.endedAt).not.toBeNull();
  });
});

describe("deriveStages", () => {
  it("asks for the user at awaiting_approval", () => {
    const view = reduceEvents([
      ev("status", { status: "awaiting_approval" }, 1),
      ev("plan_ready", { items: [{ text: "A?" }] }, 2),
    ]);
    const stages = deriveStages(view);
    expect(stages.map((s) => s.state)).toEqual([
      "done",
      "needs_action",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(stages[1].line).toBe("Waiting for you");
  });

  it("marks everything done when completed", () => {
    const stages = deriveStages(reduceEvents([ev("status", { status: "completed" }, 1)]));
    expect(stages.every((s) => s.state === "done")).toBe(true);
  });

  it("marks the reached stage failed", () => {
    const stages = deriveStages(
      reduceEvents([
        ev("status", { status: "researching" }, 1),
        ev("tool_call", { index: 0, tool: "search", query: "q" }, 2),
        ev("status", { status: "failed" }, 3),
      ]),
    );
    expect(stages[2].state).toBe("failed");
  });
});
