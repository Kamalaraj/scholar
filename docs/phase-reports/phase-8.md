# Phase 8 report: UI polish, accessibility and full system audit
Date: 2026-11-10

Status: **gate passed with one exception** (TP-8.5 Best Practices, see below). Full audit: [docs/audits/AUDIT-2026-11-10.md](../audits/AUDIT-2026-11-10.md).

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict on `app/`; eslint and `tsc` clean)
- pytest: 196 passed, coverage 85% on `app/` (`core/security.py` 88%, agents about 94%)
- Vitest: 58 passed
- Playwright suite: 36 passed, three runs in a row (new: `a11y.spec.ts`, `keyboard.spec.ts`, `design.spec.ts`)

## What was built
- **Pages the design plan asked for:** `/settings` (profile with Clerk "Manage account", theme System/Light/Dark, today's usage from the new `GET /me/usage`), a 404 page, a global error page with an error id, loading skeletons in the final layout for Desk, run and Settings.
- **App shell:** a "New brief" button and a Settings link in the top bar, a skip link, `<main id="main">` on every page, shared `AppShell`.
- **Landing:** a static illustration of the run workspace (rail, three lanes, report page) built from tokens, and a Sign in link.
- **Motion and focus:** one global `prefers-reduced-motion` rule, and a 2 px accent focus ring on every interactive element.
- **Contrast:** light `--warning`, `--success`, dark `--highlight` and the form-control border token were darkened so every text pair reaches 4.5:1 and every control edge 3:1. The design plan's colour table was updated to match.
- **Hardening:** a strict CSP and the other security headers on the frontend (HSTS only in production), hardening headers and a per-IP request limit on the API, Clerk telemetry off, LangSmith env export, and a cap on idle event channels.
- **Tooling:** `frontend/scripts/lighthouse.mjs` (signs in a real browser and audits the Desk and a finished report), `NEXT_DIST_DIR` so a production build can sit beside the dev server's `.next`.

## Playwright MCP scenarios
| ID | Result | Notes |
| --- | --- | --- |
| TP-8.1 | Pass | Landing, Desk, plan board, finished report and Settings at 1280, 768 and 375 px in light and dark: no horizontal scroll anywhere, screenshots saved |
| TP-8.2 | Pass | Brief, Ctrl+Enter, open the run, edit and reorder an angle, approve, reach Copy and a citation and open its source, all by keyboard; skip link works; every stop shows a focus ring; no focus trap; dialogs hold focus and give it back on Escape (e2e and MCP) |
| TP-8.3 | Pass | With reduced motion on, no animation or transition is longer than 5 ms (computed over every element on a finished report) |
| TP-8.4 | Pass | No robot or sparkle icons, no bubble classes, no pinned inputs, no "ask me anything" copy on any screen |
| TP-8.5 | **Partial** | Performance 94 to 100, Accessibility 100 on the Desk and a finished report, desktop and mobile. **Best Practices 78 to 79 (target 95+).** The only failing audits are third-party cookies and a cookie inspector issue, both set by Clerk's development instance. See A-010 |
| TP-R | Pass | One journey: signed in as user A, example chip and Deep, edit and delete angles, approve, reload mid-research (one "Drafted a plan", one "Report is ready", the edited lanes kept), citation click scrolls to the source card, cancel a second run |

Console: no errors on the Phase 8 scenarios.

## Bugs found and fixed
- Landing illustration overflowed at 375 px -> `design.spec.ts` TP-8.1 -> `min-w-0`.
- Our own CSP blocked Clerk's bot-protection script and probe, and Clerk telemetry -> the CSP check in `a11y.spec.ts` -> allow `*.protect.clerk.com`, and turn telemetry off.
- Contrast failures (A-001, A-002) -> axe in both themes -> tokens and tab labels.
- Selected theme had no visible state -> MCP screenshot -> ring and check mark.
- LangSmith settings were never exported (A-005), idle event channels were never evicted (A-006) -> failing tests first -> fixed.

## Audit
Full results in [AUDIT-2026-11-10.md](../audits/AUDIT-2026-11-10.md): Critical 0, High 0, Medium 1 open (A-010, environmental), Low 9 open. Nothing was deleted or allow-listed on my own: two items need Kamal's decision (57 tracked duplicate `... 2.*` files, and two gitleaks placeholder hits).

## Decisions needed from Kamal
1. **Best Practices below 95 (A-010):** accept it as a known Clerk-development-instance effect and re-measure in Phase 9 on the production instance, or hold Phase 8?
2. **Duplicate ` 2` files (A-011):** the command in the audit removes the 30 identical ones; the other 27 are older copies for you to review.
3. **gitleaks placeholders (A-012):** add the two fingerprints to `.gitleaksignore`?
4. **Favicon privacy (A-016)** and a **live deep run** to measure time and tokens (A-017).

## Screenshots
docs/phase-reports/phase-8/: landing, desk, plan, report and settings at 1280, 768 and 375 px (light), plus report and settings in dark at 1280 and 375 px.
