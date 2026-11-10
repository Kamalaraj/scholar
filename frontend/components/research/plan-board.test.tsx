import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PlanBoard } from "@/components/research/plan-board";

const plan = [
  { text: "First angle to research", reason: "Because." },
  { text: "Second angle to research", reason: null },
  { text: "Third angle to research", reason: null },
];

function setup(overrides: Partial<React.ComponentProps<typeof PlanBoard>> = {}) {
  const props = {
    onApprove: vi.fn(),
    onReplan: vi.fn(),
    question: "How do heat pumps work?",
    plan,
    busy: false,
    error: null,
    ...overrides,
  };
  render(<PlanBoard {...props} />);
  return {
    ...props,
    onApprove: props.onApprove as ReturnType<typeof vi.fn>,
    onReplan: props.onReplan as ReturnType<typeof vi.fn>,
    user: userEvent.setup(),
  };
}

const cards = () =>
  within(screen.getByRole("list", { name: "Research angles" })).getAllByRole("listitem");

describe("PlanBoard", () => {
  it("lists the plan and approves it unchanged", async () => {
    const { user, onApprove } = setup();
    expect(cards()).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /approve and start research/i }));
    expect(onApprove).toHaveBeenCalledWith(plan);
  });

  it("edits a card inline: Enter saves, Escape cancels", async () => {
    const { user, onApprove } = setup();
    await user.click(screen.getByRole("button", { name: /edit angle 2/i }));
    await user.clear(screen.getByRole("textbox", { name: "Angle 2" }));
    await user.type(screen.getByRole("textbox", { name: "Angle 2" }), "Edited second angle{Enter}");
    await user.click(screen.getByRole("button", { name: /edit angle 3/i }));
    await user.type(screen.getByRole("textbox", { name: "Angle 3" }), " changed{Escape}");
    await user.click(screen.getByRole("button", { name: /approve and start research/i }));
    expect(onApprove.mock.calls[0][0].map((i: { text: string }) => i.text)).toEqual([
      "First angle to research",
      "Edited second angle",
      "Third angle to research",
    ]);
  });

  it("deletes and adds cards, and blocks approval at zero cards", async () => {
    const { user } = setup();
    for (let i = 0; i < 3; i++)
      await user.click(screen.getByRole("button", { name: /delete angle 1/i }));
    const approve = screen.getByRole("button", { name: /approve and start research/i });
    expect(approve).toBeDisabled();
    expect(screen.getByText(/add at least one angle/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add an angle/i }));
    await user.type(screen.getByRole("textbox", { name: "Angle 1" }), "A brand new angle{Enter}");
    expect(approve).toBeEnabled();
  });

  it("discards a new card that is cancelled and stops adding at 8", async () => {
    const { user } = setup({
      plan: Array.from({ length: 7 }, (_, i) => ({ text: `Angle number ${i + 1}`, reason: null })),
    });
    await user.click(screen.getByRole("button", { name: /add an angle/i }));
    await user.keyboard("{Escape}");
    expect(cards()).toHaveLength(7);
    await user.click(screen.getByRole("button", { name: /add an angle/i }));
    await user.type(screen.getByRole("textbox", { name: "Angle 8" }), "The eighth angle{Enter}");
    expect(screen.queryByRole("button", { name: /add an angle/i })).not.toBeInTheDocument();
  });

  it("reorders with Alt+ArrowDown and announces it", async () => {
    const { user, onApprove } = setup();
    screen.getByRole("button", { name: /move angle 1/i }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(screen.getByText(/moved to position 2 of 3/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /approve and start research/i }));
    expect(onApprove.mock.calls[0][0].map((i: { text: string }) => i.text)[1]).toBe(
      "First angle to research",
    );
  });

  it("asks for a new plan with feedback", async () => {
    const { user, onReplan } = setup();
    await user.click(screen.getByRole("button", { name: /ask for a new plan/i }));
    const send = screen.getByRole("button", { name: /send feedback/i });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText(/what should the new plan change/i), "focus on Europe");
    await user.click(send);
    expect(onReplan).toHaveBeenCalledWith("focus on Europe");
  });

  it("is read-only while a decision is being sent", () => {
    setup({ busy: true });
    expect(screen.getByRole("button", { name: /approve and start research/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete angle 1/i })).toBeDisabled();
  });
});
