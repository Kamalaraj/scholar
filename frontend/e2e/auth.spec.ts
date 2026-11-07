import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_A_EMAIL;

test.skip(!process.env.CLERK_SECRET_KEY || !email, "Clerk test credentials not configured");

test("TP-1.1 signed-out visit to /dashboard redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("TP-1.2/1.3/1.4 sign in, call /me with a Bearer token, sign out", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email! });

  const meRequest = page.waitForRequest((r) => r.url().endsWith("/api/v1/me"));
  const meResponse = page.waitForResponse((r) => r.url().endsWith("/api/v1/me"));
  await page.goto("/dashboard");

  expect((await meRequest).headers()["authorization"]).toMatch(/^Bearer ey/);
  expect((await meResponse).status()).toBe(200);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByRole("button", { name: /open user menu/i })).toBeVisible();

  await clerk.signOut({ page });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
