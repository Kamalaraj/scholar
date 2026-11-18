import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportView } from "@/components/research/report-view";

const reportMarkdown = vi.fn(async () => "# Exported\n");
vi.mock("@/lib/api", () => ({ useApi: () => ({ reportMarkdown }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const sources = [
  {
    citation_num: 1,
    url: "https://nature.com/a",
    title: "Nature paper",
    domain: "nature.com",
    quote: "q1",
  },
  {
    citation_num: 2,
    url: "https://bbc.co.uk/b",
    title: "BBC report",
    domain: "bbc.co.uk",
    quote: null,
  },
];

function setup(markdown: string, findings: string[] = ["First finding [1]"]) {
  const onHighlight = vi.fn();
  const onOpen = vi.fn();
  render(
    <ReportView
      runId="run-1"
      question="How do heat pumps work?"
      depth="quick"
      date="2026-01-01T10:00:00Z"
      report={{ markdown, key_findings: findings }}
      sources={sources}
      onHighlight={onHighlight}
      onOpen={onOpen}
    />,
  );
  return { onHighlight, onOpen, user: userEvent.setup() };
}

beforeEach(() => reportMarkdown.mockClear());

describe("ReportView", () => {
  it("renders citations as labelled buttons and leaves unknown numbers as text", async () => {
    const { user, onOpen, onHighlight } = setup("## Overview\n\nHeat moves [1] and [2], not [9].");
    const cite = screen.getAllByRole("button", { name: "Source 2: BBC report, bbc.co.uk" })[0];
    await user.hover(cite);
    expect(onHighlight).toHaveBeenCalledWith(2);
    await user.unhover(cite);
    expect(onHighlight).toHaveBeenLastCalledWith(null);
    await user.click(cite);
    expect(onOpen).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("button", { name: /Source 9/ })).not.toBeInTheDocument();
    expect(screen.getByText(/not \[9\]/)).toBeInTheDocument();
  });

  it("opens citations from the keyboard and highlights on focus", async () => {
    const { user, onOpen, onHighlight } = setup("A claim [1].");
    await user.tab();
    const first = screen.getAllByRole("button", { name: /^Source 1:/ })[0];
    first.focus();
    expect(onHighlight).toHaveBeenCalledWith(1);
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("shows the Key findings box with working citations", () => {
    setup("Body [2].");
    const box = screen.getByRole("heading", { name: "Key findings" }).closest("section")!;
    expect(box).toHaveTextContent("First finding");
    expect(box.querySelector("button")).toHaveAccessibleName(/Source 1: Nature paper/);
  });

  it("never renders raw HTML or script URLs from the report", () => {
    const {} = setup(
      'Hello <img src=x onerror="alert(1)"> <script>alert(1)</script> [click](javascript:alert(1))\n\n[ok](https://x.org/p)',
    );
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
    const ok = screen.getByRole("link", { name: "ok" });
    expect(ok).toHaveAttribute("rel", "noopener noreferrer");
    expect(ok).toHaveAttribute("target", "_blank");
  });

  it("renders GFM tables", () => {
    setup("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("copies the exported Markdown and downloads it", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = setup("Body [1].");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("# Exported\n");
    await user.click(screen.getByRole("button", { name: "Download .md" }));
    expect(click).toHaveBeenCalled();
    expect(reportMarkdown).toHaveBeenCalledTimes(2);
  });
});
