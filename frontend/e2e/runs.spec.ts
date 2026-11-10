import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;
const emailB = process.env.E2E_USER_B_EMAIL;

test.skip(!process.env.CLERK_SECRET_KEY || !emailA || !emailB, "Clerk test users not configured");

async function signInAs(page: Page, emailAddress: string) {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/dashboard");
  await expect(page.getByLabel(/what do you want to find out/i)).toBeVisible();
}

const box = (page: Page) => page.getByLabel(/what do you want to find out/i);
const submit = (page: Page) => page.getByRole("button", { name: "Draft a plan" });

test("TP-2.1 short question keeps Draft a plan disabled", async ({ page }) => {
  await signInAs(page, emailA!);
  await box(page).fill("12345");
  await expect(submit(page)).toBeDisabled();
});

test("TP-2.2 example chip + Deep creates a run at the top of the library", async ({ page }) => {
  await signInAs(page, emailA!);
  const chip = page.getByRole("list", { name: "Example briefs" }).getByRole("button").first();
  const question = (await chip.textContent())!;
  await chip.click();
  await expect(box(page)).toHaveValue(question);

  await page.getByRole("button", { name: /^Deep/ }).click();
  await submit(page).click();

  const firstRow = page.getByRole("link", { name: new RegExp(question.slice(0, 30)) }).first();
  await expect(firstRow).toBeVisible();
  await expect(firstRow).toContainText(/Queued|Planning/);
  await expect(firstRow).toContainText("Deep");
  await expect(box(page)).toHaveValue("");
});

test("TP-2.3 another user opening a run URL sees not-found and none of its data", async ({
  page,
}) => {
  await signInAs(page, emailA!);
  const question = `Ownership check ${Date.now()}: how do heat pumps work?`;
  await box(page).fill(question);
  await submit(page).click();
  const row = page.getByRole("link", { name: new RegExp(question.slice(0, 25)) });
  await expect(row).toBeVisible();
  const href = (await row.getAttribute("href"))!;

  await clerk.signOut({ page });
  await signInAs(page, emailB!);
  await page.goto(href);

  await expect(page.getByRole("heading", { name: /report not found/i })).toBeVisible();
  await expect(page.getByText(question)).toHaveCount(0);
});

test("TP-2.4 fits at 375 px with 44 px touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signInAs(page, emailA!);
  await box(page).fill("A question long enough to submit");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  const targets = [
    submit(page),
    page.getByRole("button", { name: /^Quick/ }),
    page.getByRole("button", { name: /^Deep/ }),
    page.getByRole("list", { name: "Example briefs" }).getByRole("button").first(),
  ];
  for (const target of targets) {
    const size = await target.boundingBox();
    expect(size!.height).toBeGreaterThanOrEqual(44);
  }
});
