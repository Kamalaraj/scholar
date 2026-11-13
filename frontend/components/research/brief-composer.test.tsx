import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BriefComposer } from "./brief-composer";

const createRun = vi.fn();
const push = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, useApi: () => ({ createRun }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function Harness() {
  const [question, setQuestion] = useState("");
  return <BriefComposer question={question} onQuestionChange={setQuestion} />;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  push.mockReset();
  createRun.mockReset().mockResolvedValue({ id: "1" });
});

describe("BriefComposer", () => {
  it("keeps Draft a plan disabled until 10 characters are typed", async () => {
    const user = setup();
    const button = screen.getByRole("button", { name: "Draft a plan" });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/what do you want to find out/i), "12345");
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/what do you want to find out/i), "67890");
    expect(button).toBeEnabled();
  });

  it("fills the box from an example chip", async () => {
    const user = setup();
    const chip = screen
      .getAllByRole("button")
      .find((b) => /recycling EV batteries/.test(b.textContent ?? ""))!;
    await user.click(chip);
    expect(screen.getByLabelText(/what do you want to find out/i)).toHaveValue(chip.textContent);
    expect(screen.getByRole("button", { name: "Draft a plan" })).toBeEnabled();
  });

  it("submits the chosen depth and clears the box", async () => {
    const user = setup();
    await user.type(
      screen.getByLabelText(/what do you want to find out/i),
      "How do heat pumps work?",
    );
    await user.click(screen.getByRole("button", { name: /deep/i }));
    await user.click(screen.getByRole("button", { name: "Draft a plan" }));

    await waitFor(() =>
      expect(createRun).toHaveBeenCalledWith({
        question: "How do heat pumps work?",
        depth: "deep",
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/what do you want to find out/i)).toHaveValue(""),
    );
    expect(push).toHaveBeenCalledWith("/runs/1");
  });

  it("submits with Ctrl+Enter", async () => {
    const user = setup();
    await user.type(
      screen.getByLabelText(/what do you want to find out/i),
      "How do heat pumps work?",
    );
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(createRun).toHaveBeenCalledTimes(1));
  });

  it("does not submit with Ctrl+Enter while too short", async () => {
    const user = setup();
    await user.type(screen.getByLabelText(/what do you want to find out/i), "short");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(createRun).not.toHaveBeenCalled();
  });
});
