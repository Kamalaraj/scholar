import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const emailA = process.env.E2E_USER_A_EMAIL;
test.skip(!process.env.CLERK_SECRET_KEY || !emailA, "Clerk test users not configured");

const VIEWPORTS = [
  { name: "375", width: 375, height: 800 },
  { name: "768", width: 768, height: 900 },
  { name: "1280", width: 1280, height: 900 },
];

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Sign in, create a run, approve it and wait for the finished report. */
async function finishedRun(page: Page): Promise<string> {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: emailA! });
  await page.goto("/dashboard");
  const question = `Design check ${crypto.randomUUID()}: how do heat pumps work?`;
  await page.getByLabel(/what do you want to find out/i).fill(question);
  await page.getByRole("button", { name: "Draft a plan" }).click();
  await page.getByRole("link", { name: question }).first().click();
  await page.getByRole("button", { name: "Approve and start research" }).click();
  await expect(page.getByRole("heading", { name: "Key findings" })).toBeVisible({
    timeout: 60_000,
  });
  return page.url();
}

for (const theme of ["light", "dark"] as const) {
  test(`TP-8.1 every screen fits at 375, 768 and 1280 px (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const reportUrl = await finishedRun(page);
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const [path, ready] of [
        ["/", page.getByRole("heading", { level: 1 })],
        ["/dashboard", page.getByRole("list", { name: "Reports" })],
        [reportUrl, page.getByRole("heading", { name: "Key findings" })],
        ["/settings", page.getByRole("heading", { name: "Settings" })],
      ] as const) {
        await page.goto(path);
        await expect(ready).toBeVisible({ timeout: 20_000 });
        expect(await noHorizontalScroll(page), `${path} at ${vp.name}px (${theme})`).toBe(true);
      }
    }
  });
}

test("TP-8.3 reduced motion turns slides and spins into instant changes", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await finishedRun(page);
  const durations = await page.evaluate(() => {
    const longest: number[] = [];
    document.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const s = getComputedStyle(el);
      for (const d of [s.animationDuration, s.transitionDuration]) {
        for (const part of d.split(",")) {
          const v = parseFloat(part);
          longest.push(part.trim().endsWith("ms") ? v : v * 1000);
        }
      }
    });
    return Math.max(...longest);
  });
  expect(durations).toBeLessThan(5); // no animation or transition longer than 5 ms
});

test("TP-8.4 no chat-style UI or AI clichés on any screen", async ({ page }) => {
  test.setTimeout(120_000);
  const reportUrl = await finishedRun(page);
  for (const path of ["/", "/dashboard", reportUrl, "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const found = await page.evaluate(() => {
      const issues: string[] = [];
      if (
        document.querySelector(
          "svg.lucide-bot, svg.lucide-sparkles, svg.lucide-sparkle, svg.lucide-wand-sparkles, svg.lucide-brain",
        )
      )
        issues.push("robot or sparkle icon");
      if (document.querySelector('[class*="bubble"], [class*="chat-"], [data-testid*="chat"]'))
        issues.push("chat bubble class");
      document.querySelectorAll("textarea, input[type=text]").forEach((el) => {
        const pos = getComputedStyle(el.closest("form") ?? el).position;
        if (pos === "fixed") issues.push("pinned input");
      });
      const text = document.body.innerText;
      if (/ask me anything|ai is thinking|\bchat\b/i.test(text)) issues.push("chat copy");
      return issues;
    });
    expect(found, path).toEqual([]);
  }
});
