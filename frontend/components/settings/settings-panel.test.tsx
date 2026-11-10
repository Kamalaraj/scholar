import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "@/components/settings/settings-panel";

const usage = vi.fn();
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ openUserProfile: vi.fn() }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  useApi: () => ({
    me: async () => ({ id: "u1", clerk_user_id: "user_1", email: "a@example.com" }),
    usage,
  }),
}));

function renderPanel() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsPanel />
    </QueryClientProvider>,
  );
}

describe("SettingsPanel", () => {
  it("shows the profile, the theme choice and today's usage", async () => {
    usage.mockResolvedValue({ used: 2, limit: 5, resets_at: "2999-01-01T00:00:00Z" });
    renderPanel();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    expect(await screen.findByText(/reports started today/)).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "2 of 5 reports used today" }),
    ).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Theme" });
    expect(group).toHaveTextContent("System");
    expect(group).toHaveTextContent("Light");
    expect(group).toHaveTextContent("Dark");
  });

  it("says when the allowance is used up", async () => {
    usage.mockResolvedValue({ used: 5, limit: 5, resets_at: "2999-01-01T00:00:00Z" });
    renderPanel();
    expect(await screen.findByText(/used all of today's reports/)).toBeInTheDocument();
  });

  it("offers a retry when usage cannot be loaded", async () => {
    usage.mockRejectedValue(new Error("down"));
    renderPanel();
    expect(await screen.findByText("We could not load your usage.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
