// Lighthouse on the Desk and a finished report, signed in as a Clerk test user.
//
//   BASE_URL=http://localhost:3100 API_URL=http://localhost:8001/api/v1 node scripts/lighthouse.mjs
//
// A real Chromium is launched with a debugging port, signed in through @clerk/testing, and
// Lighthouse attaches to it (--port) with storage reset disabled so the session is kept.
// Needs a production build (`next build && next start`): dev mode is not representative.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { chromium } from "@playwright/test";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../.env.local") });
config({ path: path.resolve(import.meta.dirname, "../.env.test.local") });

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const API = process.env.API_URL ?? "http://localhost:8001/api/v1";
const OUT =
  process.env.OUT_DIR ?? path.resolve(import.meta.dirname, "../../docs/audits/lighthouse");
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

await clerkSetup();

// Start Chromium ourselves and attach Playwright only to sign in. Lighthouse must be the browser's
// only client afterwards, otherwise it fails with TRACING_ALREADY_STARTED.
const profile = path.join(OUT, ".profile");
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(
  chromium.executablePath(),
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);
for (let i = 0; i < 50; i++) {
  if ((await fetch(`http://localhost:${PORT}/json/version`).catch(() => null))?.ok) break;
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const context = browser.contexts()[0];
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(BASE);
await clerk.signIn({ page, emailAddress: process.env.E2E_USER_A_EMAIL });
await page.goto(`${BASE}/dashboard`);
await page.getByRole("list", { name: "Reports" }).waitFor({ timeout: 30_000 });

await page.waitForFunction(() => window.Clerk?.session, null, { timeout: 30_000 });

// A finished report to audit.
const reportUrl = await page.evaluate(
  async ([api, base]) => {
    const token = await window.Clerk.session.getToken();
    const call = (p, init = {}) =>
      fetch(`${api}${p}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }).then((r) => r.json());
    const run = await call("/runs", {
      method: "POST",
      body: JSON.stringify({
        question: "How do heat pumps work in cold climates?",
        depth: "quick",
      }),
    });
    for (let i = 0; i < 100 && (await call(`/runs/${run.id}`)).status !== "awaiting_approval"; i++)
      await new Promise((r) => setTimeout(r, 300));
    await call(`/runs/${run.id}/plan`, {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });
    for (let i = 0; i < 200 && (await call(`/runs/${run.id}`)).status !== "completed"; i++)
      await new Promise((r) => setTimeout(r, 300));
    return `${base}/runs/${run.id}`;
  },
  [API, BASE],
);

await page.close();
await browser.close(); // disconnects Playwright; the browser itself keeps running

const targets = [
  ["desk", `${BASE}/dashboard`],
  ["report", reportUrl],
];
const summary = [];
for (const [name, url] of targets) {
  for (const form of ["desktop", "mobile"]) {
    const file = path.join(OUT, `${name}-${form}.json`);
    const args = [
      "--yes",
      "lighthouse@12.8.2",
      url,
      `--port=${PORT}`,
      "--disable-storage-reset",
      "--output=json",
      `--output-path=${file}`,
      "--quiet",
      "--only-categories=performance,accessibility,best-practices",
    ];
    if (form === "desktop") args.push("--preset=desktop");
    const run = spawnSync("npx", args, { encoding: "utf8" });
    if (run.status !== 0) {
      console.error(run.stderr);
      process.exitCode = 1;
      continue;
    }
    const lhr = JSON.parse(readFileSync(file, "utf8"));
    if (lhr.runtimeError) {
      console.error(`${name}/${form}: ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
      process.exitCode = 1;
      continue;
    }
    const score = (c) => Math.round(lhr.categories[c].score * 100);
    summary.push({
      page: name,
      form,
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      finalUrl: new URL(lhr.finalDisplayedUrl).pathname.replace(/[0-9a-f-]{36}/, ":id"),
    });
  }
}
console.table(summary);
chrome.kill();
rmSync(profile, { recursive: true, force: true });
