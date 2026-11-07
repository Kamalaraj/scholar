import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the headline and start button", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /research briefs, written by a team of agents/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start researching/i })).toBeInTheDocument();
  });
});
