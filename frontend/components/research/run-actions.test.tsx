import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunStopped } from "@/components/research/run-actions";
import { ResearchFloor } from "@/components/research/research-floor";
import { ApiError } from "@/lib/api";

const push = vi.fn();
const retryRun = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  useApi: () => ({ retryRun, cancelRun: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderStopped(props: Partial<React.ComponentProps<typeof RunStopped>> = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RunStopped runId="run-1" kind="failed" message={null} at={null} {...props} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  push.mockClear();
  retryRun.mockReset();
});

describe("RunStopped", () => {
  it("explains a failure in plain words, hiding the error id under Details", () => {
    renderStopped({ message: "The run took longer than 10 minutes. (error id ab12cd34)" });
    expect(screen.getByText("The run took longer than 10 minutes.")).toBeInTheDocument();
    expect(screen.getByText("Error id: ab12cd34")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("has no Details disclosure when there is no error id", () => {
    renderStopped({ message: "The server restarted while the plan was being drafted." });
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
  });

  it("Retry creates a new run and opens it", async () => {
    retryRun.mockResolvedValue({ id: "run-2" });
    const user = renderStopped({ message: "boom" });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryRun).toHaveBeenCalledWith("run-1");
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/runs/run-2"));
  });

  it("a rate-limited retry stays on the page", async () => {
    retryRun.mockRejectedValue(new ApiError(429, "You have started all 5 reports for today."));
    const user = renderStopped({ message: "boom" });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(retryRun).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();
  });

  it("a cancelled run offers to start again with the same plan", () => {
    renderStopped({ kind: "cancelled", at: "2026-01-01T10:00:00Z" });
    expect(screen.getByRole("heading", { name: "This run was cancelled" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again with this plan" })).toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
  });
});

describe("ResearchFloor on a stopped run", () => {
  const plan = [{ text: "First angle to research", reason: null }];
  const lanes = [
    { index: 0, phase: "reading" as const, queries: ["q"], pagesRead: 0, sources: [] },
  ];

  it("shows unfinished lanes as Stopped, not still working", () => {
    render(<ResearchFloor plan={plan} lanes={lanes} stopped />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.queryByText("Reading sources")).not.toBeInTheDocument();
  });

  it("keeps finished lanes Done and live lanes working", () => {
    const { rerender } = render(
      <ResearchFloor plan={plan} lanes={[{ ...lanes[0], phase: "done" }]} stopped />,
    );
    expect(screen.getByText("Done")).toBeInTheDocument();
    rerender(<ResearchFloor plan={plan} lanes={lanes} />);
    expect(screen.getByText("Reading sources")).toBeInTheDocument();
  });
});
