import AxeBuilder from "@axe-core/playwright";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;

type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];

async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
}

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map(
          (n) => `${n.target.join(" ")} :: ${n.html.slice(0, 120)} :: ${n.any[0]?.message ?? ""}`,
        )
        .join(" | ")}`,
  );
  expect(summary, `${label} has axe violations`).toEqual([]);
}

/** Console messages that mean the Content-Security-Policy blocked something we need. */
function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) violations.push(m.text().slice(0, 200));
  });
  return violations;
}

for (const theme of THEMES) {
  test.describe(`axe, ${theme} theme, signed out`, () => {
    test("landing page", async ({ page }) => {
      await setTheme(page, theme);
      const csp = watchCsp(page);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoViolations(page, `landing (${theme})`);
      expect(csp).toEqual([]);
    });

    test("not-found page", async ({ page }) => {
      await setTheme(page, theme);
      await page.goto("/this-page-does-not-exist");
      await expect(page.getByRole("heading", { name: /could not find that page/i })).toBeVisible();
      await expectNoViolations(page, `404 (${theme})`);
    });
  });
}

test.describe("axe, signed in", () => {
  test.skip(!process.env.CLERK_SECRET_KEY || !emailA, "Clerk test users not configured");

  for (const theme of THEMES) {
    test(`desk, plan board, report, settings (${theme})`, async ({ page }) => {
      test.setTimeout(90_000);
      await setTheme(page, theme);
      const csp = watchCsp(page);
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: emailA! });

      await page.goto("/dashboard");
      await expect(page.getByRole("list", { name: "Reports" })).toBeVisible();
      await expectNoViolations(page, `desk (${theme})`);

      const question = `Axe check ${crypto.randomUUID()}: how do heat pumps work?`;
      await page.getByLabel(/what do you want to find out/i).fill(question);
      await page.getByRole("button", { name: "Draft a plan" }).click();
      await page.getByRole("link", { name: question }).first().click();
      await expect(page.getByRole("list", { name: "Research angles" })).toBeVisible({
        timeout: 20_000,
      });
      await expectNoViolations(page, `plan board (${theme})`);

      await page.getByRole("button", { name: "Approve and start research" }).click();
      await expect(page.getByRole("heading", { name: "Research floor" })).toBeVisible();
      await expectNoViolations(page, `research floor (${theme})`);

      await expect(page.getByRole("heading", { name: "Key findings" })).toBeVisible({
        timeout: 60_000,
      });
      await expectNoViolations(page, `report (${theme})`);

      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await expect(page.getByText(/reports started today/)).toBeVisible();
      await expectNoViolations(page, `settings (${theme})`);
      expect(csp).toEqual([]);
    });
  }
});
