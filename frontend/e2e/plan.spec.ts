import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;
test.skip(!process.env.CLERK_SECRET_KEY || !emailA, "Clerk test users not configured");

async function openPlan(page: Page): Promise<void> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: emailA! });
  await page.goto("/dashboard");
  const question = `Plan review ${crypto.randomUUID()}: how do heat pumps work?`;
  await page.getByLabel(/what do you want to find out/i).fill(question);
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await page.getByRole("link", { name: question }).first().click();
  await expect(page.getByRole("list", { name: "Research angles" })).toBeVisible({
    timeout: 20_000,
  });
}

const angles = (page: Page) =>
  page.getByRole("list", { name: "Research angles" }).getByRole("listitem");
const approve = (page: Page) => page.getByRole("button", { name: "Approve and start research" });

test("TP-5.1 plan stage asks for the user and lists 3 editable cards", async ({ page }) => {
  await openPlan(page);
  await expect(page.getByText("Your turn · Waiting for you")).toBeVisible();
  await expect(angles(page)).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: /edit anything before research starts/i }),
  ).toBeVisible();
});

test("TP-5.2 edited, deleted and added angles are what the research floor shows", async ({
  page,
}) => {
  await openPlan(page);
  await page.getByRole("button", { name: /^Edit angle 2/ }).click();
  const box = page.getByRole("textbox", { name: "Angle 2" });
  await box.fill("My edited second angle");
  await box.press("Enter");
  await page.getByRole("button", { name: "Delete angle 3" }).click();
  await page.getByRole("button", { name: "Add an angle" }).click();
  await page.getByRole("textbox", { name: "Angle 3" }).fill("My brand new angle");
  await page.getByRole("textbox", { name: "Angle 3" }).press("Enter");
  await approve(page).click();

  const floor = page.getByRole("region", { name: "Research floor" });
  await expect(floor.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(floor.getByRole("heading", { name: "My edited second angle" })).toBeVisible();
  await expect(floor.getByRole("heading", { name: "My brand new angle" })).toBeVisible();
  await expect(page.getByText("The report is ready")).toBeVisible({ timeout: 60_000 });
  // The searches that actually ran used the edited text, and survive a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "My edited second angle" })).toBeVisible();
});

test("TP-5.3 keyboard reorder with Alt+ArrowDown is announced and used", async ({ page }) => {
  await openPlan(page);
  const first = await angles(page)
    .nth(0)
    .getByRole("button", { name: /^Edit angle 1/ })
    .innerText();
  await page.getByRole("button", { name: /^Move angle 1/ }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.getByText("Angle moved to position 2 of 3.")).toBeAttached();
  await expect(angles(page).nth(1)).toContainText(first);
  await approve(page).click();
  await expect(
    page.getByRole("region", { name: "Research floor" }).getByRole("heading", { level: 3 }).nth(1),
  ).toHaveText(first);
});

test("TP-5.4 asking for a new plan with feedback returns a new plan", async ({ page }) => {
  await openPlan(page);
  const before = await angles(page).nth(0).innerText();
  await page.getByRole("button", { name: "Ask for a new plan" }).click();
  await page.getByLabel(/what should the new plan change/i).fill("focus on Europe");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByRole("heading", { name: "Drafting the plan" })).toBeVisible();
  await expect(angles(page).nth(0)).toContainText("(revised)", { timeout: 20_000 });
  expect(await angles(page).nth(0).innerText()).not.toBe(before);
  await expect(page.getByText("Your turn · Waiting for you")).toBeVisible();
});

test("TP-5.5 approving with 0 cards is blocked in the UI and by the API", async ({ page }) => {
  await openPlan(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Delete angle 1" }).click();
  await expect(approve(page)).toBeDisabled();
  await expect(page.getByText("Add at least one angle to approve the plan.")).toBeVisible();

  const id = page.url().split("/runs/")[1];
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  const status = await page.evaluate(
    async ([base, runId]) => {
      const token = await (
        window as unknown as { Clerk: { session: { getToken(): Promise<string> } } }
      ).Clerk.session.getToken();
      const res = await fetch(`${base}/runs/${runId}/plan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", items: [] }),
      });
      return res.status;
    },
    [api, id],
  );
  expect(status).toBe(422);
});

test("plan board fits at 375 px with 44 px touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openPlan(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  for (const name of [/^Move angle 1/, /^Delete angle 1/]) {
    const box = (await page.getByRole("button", { name }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
