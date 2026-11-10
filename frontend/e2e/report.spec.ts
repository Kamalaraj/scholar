import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;
test.skip(!process.env.CLERK_SECRET_KEY || !emailA, "Clerk test users not configured");

async function finishedRun(page: Page): Promise<string> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: emailA! });
  await page.goto("/dashboard");
  const question = `Report check ${crypto.randomUUID()}: how do heat pumps work?`;
  await page.getByLabel(/what do you want to find out/i).fill(question);
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await page.getByRole("link", { name: question }).first().click();
  await page.getByRole("button", { name: "Approve and start research" }).click();
  await expect(page.getByRole("heading", { name: "Key findings" })).toBeVisible({
    timeout: 60_000,
  });
  return question;
}

const cite = (page: Page, n: number) =>
  page
    .locator(".report-prose")
    .getByRole("button", { name: new RegExp(`^Source ${n}:`) })
    .first();

test("TP-6.1 report renders in serif with Key findings and numbered citations", async ({
  page,
}) => {
  await finishedRun(page);
  const body = page.locator(".report-prose").last();
  await expect(body.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(await body.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/serif/i);
  expect(await body.evaluate((el) => getComputedStyle(el).fontSize)).toBe("18px");
  await expect(cite(page, 1)).toBeVisible();
  const findings = page.getByRole("region", { name: "Key findings" });
  expect(await findings.getByRole("listitem").count()).toBeGreaterThanOrEqual(3);
});

test("TP-6.2 hover then click a citation highlights and scrolls to its source card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await finishedRun(page);
  const card = page.getByRole("article", { name: /^Source 2:/ });
  await cite(page, 2).hover();
  await expect(card).toHaveAttribute("data-active", "true");
  await page.mouse.move(0, 0);
  await expect(card).not.toHaveAttribute("data-active", "true");
  await cite(page, 2).click();
  await expect(card).toHaveAttribute("data-active", "true");
  await expect(card).toBeInViewport();
  await expect(card.getByRole("link", { name: /Open source/ })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
});

test("TP-6.3 Download .md and Copy give the same Markdown, with a toast", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const question = await finishedRun(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .md" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^report-check-.*\.md$/);
  const fs = await import("node:fs/promises");
  const file = await fs.readFile((await download.path())!, "utf8");
  expect(file.startsWith(`# ${question}`)).toBe(true);
  expect(file).toContain("## Key findings");
  expect(file).toContain("## Sources");

  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText("Report copied as Markdown")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(file);
});

test("TP-6.4 at 375 px a citation opens a bottom sheet that Escape closes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await finishedRun(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
  await cite(page, 1).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("article", { name: /^Source 1:/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});
