import { expect, test } from "@playwright/test";

test("landing page renders with headline and theme toggle", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /research briefs, written by a team of agents/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /start researching/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /switch to (dark|light) theme/i })).toBeVisible();

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.reload();
  expect(consoleErrors).toEqual([]);
});
