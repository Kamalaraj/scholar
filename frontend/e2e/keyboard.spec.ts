import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;
test.skip(!process.env.CLERK_SECRET_KEY || !emailA, "Clerk test users not configured");

/** Press Tab until `target` has focus. Fails if it is never reached (a focus trap or a gap). */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${target}`);
}

/** The focused element must show a ring or outline, never nothing. */
async function expectVisibleFocus(page: Page, what: string) {
  const visible = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0;
    const ring = s.boxShadow !== "none" && s.boxShadow !== "";
    return outline || ring;
  });
  expect(visible, `${what} shows a focus indicator`).toBe(true);
}

test("TP-8.2 brief to report with the keyboard only", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: emailA! });
  await page.goto("/dashboard");

  // The first Tab stop is the skip link, and it works.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await expectVisibleFocus(page, "skip link");
  await page.keyboard.press("Enter");

  // Write the brief and submit with Ctrl+Enter.
  const question = `Keyboard journey ${crypto.randomUUID()}: how do heat pumps work?`;
  const box = page.getByLabel(/what do you want to find out/i);
  await tabTo(page, box);
  await expectVisibleFocus(page, "brief box");
  await page.keyboard.type(question);
  await page.keyboard.press("Control+Enter");

  // Open the new run from the library.
  const row = page.getByRole("link", { name: question });
  await expect(row).toBeVisible();
  await tabTo(page, row);
  await expectVisibleFocus(page, "library row");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Research angles" })).toBeVisible({
    timeout: 20_000,
  });

  // Edit the first angle, reorder it with Alt+Down, then approve.
  await tabTo(page, page.getByRole("button", { name: /^Edit angle 1/ }));
  await expectVisibleFocus(page, "angle");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+A");
  await page.keyboard.type("My keyboard-edited first angle");
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: /^Move angle 1/ }));
  await page.keyboard.press("Alt+ArrowDown");
  await expect(page.getByText("Angle moved to position 2 of 3.")).toBeAttached();
  const approve = page.getByRole("button", { name: "Approve and start research" });
  await tabTo(page, approve);
  await expectVisibleFocus(page, "approve button");
  await page.keyboard.press("Enter");

  // The report: reach a citation, open its source, and get out again.
  await expect(page.getByRole("heading", { name: "Key findings" })).toBeVisible({
    timeout: 60_000,
  });
  const copy = page.getByRole("button", { name: "Copy" });
  await tabTo(page, copy);
  await expectVisibleFocus(page, "Copy button");
  const citation = page
    .locator(".report-prose")
    .last()
    .getByRole("button", { name: /^Source 1:/ })
    .first();
  await tabTo(page, citation);
  await expectVisibleFocus(page, "citation");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: /^Source 1:/ }).first()).toBeVisible();

  // No focus trap: Tab and Shift+Tab keep moving through the page.
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    seen.add(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? ""));
  }
  expect(seen.size).toBeGreaterThan(5);
  await page.keyboard.press("Shift+Tab");
  await expectVisibleFocus(page, "after Shift+Tab");
});

test("dialogs trap focus inside and give it back on Escape", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: emailA! });
  await page.goto("/dashboard");
  const question = `Dialog focus ${crypto.randomUUID()}: how do heat pumps work?`;
  await page.getByLabel(/what do you want to find out/i).fill(question);
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await page.getByRole("link", { name: question }).first().click();
  await expect(page.getByRole("list", { name: "Research angles" })).toBeVisible({
    timeout: 20_000,
  });

  const cancel = page.getByRole("button", { name: "Cancel run" });
  await cancel.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100); // the focus guard needs a tick, as with a real keyboard
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(cancel).toBeFocused();
});
