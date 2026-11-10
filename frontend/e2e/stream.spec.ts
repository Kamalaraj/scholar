import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;
test.skip(!process.env.CLERK_SECRET_KEY || !emailA, "Clerk test users not configured");

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function createRun(page: Page): Promise<string> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: emailA! });
  await page.goto("/dashboard");
  const question = `Stream check ${crypto.randomUUID()}: how do heat pumps work?`;
  await page.getByLabel(/what do you want to find out/i).fill(question);
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await page.getByRole("link", { name: question }).first().click();
  await page.waitForURL(/\/runs\/.+/);
  return page.url().split("/runs/")[1];
}

/** These specs watch the stream, not the plan board: approve through the API with the page's session. */
async function approve(page: Page, runId: string) {
  await page.evaluate(
    async ([api, id]) => {
      const token = await (
        window as unknown as { Clerk: { session: { getToken(): Promise<string> } } }
      ).Clerk.session.getToken();
      await fetch(`${api}/runs/${id}/plan`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
    },
    [API, runId],
  );
}

test("TP-4.1 rail and activity update live without reload", async ({ page }) => {
  const runId = await createRun(page);
  await expect(page.getByRole("navigation", { name: "Progress" })).toBeVisible();
  await expect(page.getByText("Your turn · Waiting for you")).toBeVisible({ timeout: 20_000 });
  await approve(page, runId);
  await expect(page.getByRole("heading", { name: "Research floor" })).toBeVisible();
  await expect(page.getByText("The report is ready")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(
    page.getByRole("list", { name: "Activity" }).getByText("Report is ready"),
  ).toBeVisible();
});

test("TP-4.2 reload mid-run shows each event once", async ({ page }) => {
  const runId = await createRun(page);
  await expect(page.getByText("Your turn · Waiting for you")).toBeVisible({ timeout: 20_000 });
  await approve(page, runId);
  await expect(page.getByRole("heading", { name: "Research floor" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("The report is ready")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Activity" }).click();
  const items = await page
    .getByRole("list", { name: "Activity" })
    .getByRole("listitem")
    .allTextContents();
  for (const text of ["Drafted a plan", "Started writing", "Report is ready"]) {
    expect(items.filter((t) => t.includes(text))).toHaveLength(1);
  }
});

test("run page fits at 375 px with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await createRun(page);
  await expect(page.getByText("Your turn · Waiting for you")).toBeVisible({ timeout: 20_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
