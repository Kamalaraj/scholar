import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;
test.skip(!process.env.CLERK_SECRET_KEY || !emailA, "Clerk test users not configured");

async function signIn(page: Page) {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: emailA! });
  await page.goto("/dashboard");
}

/** Create a run from the Desk and wait until its plan is ready for review. */
async function newPlannedRun(page: Page, tag: string): Promise<string> {
  await signIn(page);
  const question = `Management check ${tag}: how do heat pumps work?`;
  await page.getByLabel(/what do you want to find out/i).fill(question);
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await page.getByRole("link", { name: question }).first().click();
  await expect(page.getByRole("list", { name: "Research angles" })).toBeVisible({
    timeout: 20_000,
  });
  return question;
}

const angleTexts = (page: Page) =>
  page
    .getByRole("list", { name: "Research angles" })
    .getByRole("button", { name: /^Edit angle/ })
    .allInnerTexts();

test("TP-7.1 search and filter narrow the library; no match shows the empty state", async ({
  page,
}) => {
  const tag = crypto.randomUUID();
  const question = await newPlannedRun(page, tag);
  await page.goto("/dashboard");
  const library = page.getByRole("region", { name: "Your reports" });

  await library.getByRole("searchbox", { name: "Search your reports" }).fill(tag);
  await expect(library.getByRole("list", { name: "Reports" }).getByRole("listitem")).toHaveCount(1);
  await expect(library.getByRole("link", { name: question })).toContainText("Needs review");

  await library.getByRole("combobox", { name: "Filter by status" }).click();
  await page.getByRole("option", { name: "Needs review" }).click();
  await expect(library.getByRole("link", { name: question })).toBeVisible();

  await library.getByRole("combobox", { name: "Filter by status" }).click();
  await page.getByRole("option", { name: "Done" }).click();
  await expect(library.getByText("No reports match your search.")).toBeVisible();

  await library.getByRole("button", { name: "Clear search and filter" }).click();
  await expect(library.getByRole("searchbox", { name: "Search your reports" })).toHaveValue("");
  await expect(
    library.getByRole("list", { name: "Reports" }).getByRole("listitem").first(),
  ).toBeVisible();
});

test("TP-7.2 cancelling during research asks first, greys the rail and stops new events", async ({
  page,
}) => {
  await newPlannedRun(page, crypto.randomUUID());
  await page.getByRole("button", { name: "Approve and start research" }).click();
  await expect(page.getByRole("heading", { name: "Research floor" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel run" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Cancel this run?");
  await dialog.getByRole("button", { name: "Keep going" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Cancel run" })).toBeVisible(); // still running

  await page.getByRole("button", { name: "Cancel run" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByRole("heading", { name: "This run was cancelled" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Progress" }).getByText("Cancelled").first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel run" })).toHaveCount(0);
  await expect(page.getByText("Stopped").first()).toBeVisible(); // lanes no longer spin
  await expect(page.getByText("Reading sources")).toHaveCount(0);

  await page.getByRole("tab", { name: "Activity" }).click();
  const activity = page.getByRole("list", { name: "Activity" }).getByRole("listitem");
  await expect(activity.last()).toContainText("Run cancelled");
  const count = await activity.count();
  await page.waitForTimeout(4000); // longer than any step of the fake agents
  expect(await activity.count()).toBe(count);
  await expect(page.getByRole("heading", { name: "Key findings" })).toHaveCount(0);
});

test("TP-7.4 Start again with this plan creates a new run with the same plan", async ({ page }) => {
  await newPlannedRun(page, crypto.randomUUID());
  const plan = await angleTexts(page);
  const oldUrl = page.url();
  await page.getByRole("button", { name: "Cancel run" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel run" }).click();
  await expect(page.getByRole("heading", { name: "This run was cancelled" })).toBeVisible();

  await page.getByRole("button", { name: "Start again with this plan" }).click();
  await page.waitForURL((url) => url.href !== oldUrl && /\/runs\/.+/.test(url.pathname));
  await expect(page.getByRole("list", { name: "Research angles" })).toBeVisible({
    timeout: 20_000,
  });
  expect(await angleTexts(page)).toEqual(plan);
  await expect(page.getByText("Your turn · Waiting for you")).toBeVisible();
});

test("deleting a report asks first and removes it from the library", async ({ page }) => {
  const tag = crypto.randomUUID();
  const question = await newPlannedRun(page, tag);
  await page.goto("/dashboard");
  const library = page.getByRole("region", { name: "Your reports" });
  await library.getByRole("searchbox", { name: "Search your reports" }).fill(tag);
  const row = library.getByRole("link", { name: question });
  await expect(row).toBeVisible();

  await library.getByRole("button", { name: `Delete report: ${question}` }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete this report?");
  await dialog.getByRole("button", { name: "Keep it" }).click();
  await expect(row).toBeVisible();

  await library.getByRole("button", { name: `Delete report: ${question}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(row).toHaveCount(0);
  await expect(library.getByText("No reports match your search.")).toBeVisible();
});
