# Phase 0 report: Foundation and tooling
Date: 2026-11-07

## What was built

- Monorepo layout: `backend/`, `frontend/`, `docs/`, `.github/workflows/`, `docker-compose.yml`, `.env.example`, `.env.test`, `Makefile`, `.gitignore`.
- `docker-compose.yml`: `db` (`pgvector/pgvector:pg17`, named volume, healthcheck), `backend`, `frontend` services.
- Backend: FastAPI app (`app/main.py`) with `GET /api/v1/health` returning `{"status": "ok", "db": "ok"|"error"}` after a `SELECT 1`. `pydantic-settings` config (`app/core/config.py`), `structlog` JSON logging, CORS limited to `FRONTEND_ORIGIN`. Tooling: ruff (lint + format), mypy strict on `app/`, pytest + pytest-asyncio + httpx `AsyncClient`. `uv` project, non-root Dockerfile.
- Frontend: `create-next-app` scaffold on **Next.js 16.4.5** (latest — see note below), TypeScript strict, Tailwind v4, `shadcn/ui` initialized. Design tokens from `DESIGN_PLAN.md` section 3 (warm paper light theme, warm ink dark theme, teal accent, highlight/success/warning tokens) wired into `app/globals.css` via `@theme inline`. Fonts via `next/font/google`: Inter (`--font-sans`), Source Serif 4 (`--font-serif`), JetBrains Mono (`--font-mono`). `next-themes` theme provider + toggle (light/dark/system, persists via `next-themes`'s own storage). Minimal landing page matching DESIGN_PLAN section 5.1 (headline, sub-line, three steps, "Start researching" CTA, no chat UI). Multi-stage non-root Dockerfile using `output: "standalone"`.
- Frontend tooling: ESLint (flat config, `eslint-config-next`), Prettier, `tsc --noEmit` strict, Vitest + Testing Library (`app/page.test.tsx`).
- Playwright: `frontend/e2e/smoke.spec.ts` (headline, CTA, theme toggle visible, no console errors on reload), `playwright.config.ts` with `webServer` auto-start. Playwright MCP registered (`claude mcp add playwright ...`).
- GitHub Actions `ci.yml`: `backend` job (ruff, mypy, pytest with a Postgres 17 + pgvector service container), `frontend` job (lint, tsc, vitest, build), `e2e` job (Playwright suite, gated to `main`).
- `Makefile`: `dev`, `test`, `lint`, `e2e`, `db-up`, `db-down`, `migrate`, `types`, `install` targets.

**Deviation from the written stack table:** the user asked mid-phase to use the latest Next.js instead of the pinned Next 15. Installed Next.js 16.4.5 / React 19.3.1 and updated `CLAUDE.md` and `IMPLEMENTATION_PLAN.md`'s stack line to say "Next.js (latest)" instead of "Next.js 15". This also happened to resolve a High-severity transient `postcss` advisory that shipped inside Next 15.5.29's bundle (see audit below).

## Automated checks
- Lint/types: pass (`make lint` — ruff, ruff format --check, mypy strict on `backend/app`; ESLint flat config + `tsc --noEmit` strict on `frontend`)
- pytest: 1 passed, 84% coverage on `app/` (only the health route and plumbing exist yet, so this is expected to rise once real endpoints land in Phase 2)
- Vitest: 1 passed
- Playwright suite: 1 passed (`e2e/smoke.spec.ts`)
- `npm run build` (Next.js production build, Turbopack): succeeds, produces standalone output

## Playwright MCP scenarios

Playwright MCP's interactive browser tools dropped out of this session partway through (the server had to be reconfigured to point at a locally installed Chromium-for-Testing binary, since this machine has no system Google Chrome install at `/Applications/Google Chrome.app`; after killing the stale server process so the new config would take effect, the harness's tool binding for this session didn't reconnect). Rather than leave the scenarios unverified, I ran the identical checks directly through Playwright's browser automation library (the same engine MCP drives) from a one-off script, with real screenshots and real console/network capture — not a simulation. The MCP tool itself should reconnect cleanly in a fresh session; flagged here as a known environment quirk, not a product issue.

| ID | Result | Notes |
| --- | --- | --- |
| TP-0.1 | Pass | Landing renders at 1280px and 375px (no horizontal overflow at 375px). Zero console errors, zero failed requests. `body` font resolves to `Inter, "Inter Fallback"`, `h1` resolves to `Source Serif 4`. Screenshot: `phase-0/tp-0.1-landing-1280.png`, `phase-0/tp-0.1-landing-375.png`. |
| TP-0.2 | Pass | Toggled theme light → dark: background `rgb(250,248,245)` → `rgb(22,19,15)`, `<html>` class → `dark`. Reloaded: theme and background persisted (`next-themes` localStorage). Screenshot: `phase-0/tp-0.2-dark-theme-1280.png`. |
| TP-0.3 | Pass | `GET http://localhost:8000/api/v1/health` → `200 {"status":"ok","db":"ok"}`. |

## Bugs found and fixed
- **Fonts never applied, page rendered in browser-default serif (Times).** `app/globals.css` had `html { @apply font-sans; }`, but the `--font-sans` CSS custom property (set by `next/font`'s generated class) was only present on `<body>`, a descendant of `<html>` — CSS variables don't cascade upward, so `html`'s `font-sans` utility resolved to nothing. → Caught by the TP-0.1 automated check (`bodyFont` computed style) → Fixed by moving the `font-sans` utility onto the `body` rule itself in `app/globals.css`, alongside `bg-background text-foreground`.
- **ESLint crashed on Next.js 16 (`Converting circular structure to JSON`).** The `create-next-app@15` scaffold's `eslint.config.mjs` used `FlatCompat(...).extends("next/core-web-vitals", "next/typescript")`, which is the legacy-interop path. `eslint-config-next@16` ships a native flat-config array, and running it through `FlatCompat` created a circular plugin reference. → Fixed by rewriting `eslint.config.mjs` to `import nextConfig from "eslint-config-next"` and spread it directly.
- **`react-hooks/set-state-in-effect` lint error in `ThemeToggle`.** The standard next-themes hydration-safe pattern (`useState` + `useEffect(() => setMounted(true), [])`) is now flagged by the updated `eslint-plugin-react-hooks` shipped with `eslint-config-next@16`. → Fixed by replacing it with `useSyncExternalStore` (subscribes to nothing, server snapshot `false`, client snapshot `true`) — no behavior change, same hydration-safe guard, satisfies the new rule.
- **`shadcn` CLI misplaced in `dependencies` instead of `devDependencies`.** `shadcn init` added the CLI package itself to `dependencies`, which pulled its (dev-only-relevant) `deepmerge`/`ts-morph`/`minimatch` advisories into the `npm audit --omit=dev` production surface. → Fixed by moving `shadcn` to `devDependencies`; `npm audit --omit=dev` now reports 0 vulnerabilities.

No regression tests were added for these (Phase 0 has no app-level test suite beyond the smoke checks above yet); the fixes are covered by the TP-0.1/TP-0.2 checks and `make lint` passing.

## Mini audit (AUDIT_PLAN.md section 2, Phase 0 sections: 3.6 Dependencies, 3.7 Code quality, 3.9 Secrets)

**3.6 Dependencies and supply chain**
- `uv run pip-audit` (via `uvx pip-audit` against the backend venv): **no known vulnerabilities**.
- `npm audit --omit=dev` (frontend, production dependencies only): **0 vulnerabilities**, after upgrading to Next.js 16.4.5 (resolved a High `postcss` XSS/path-traversal advisory bundled inside Next 15.5.29) and moving the `shadcn` CLI out of `dependencies`.
- `npm audit` (including devDependencies): 13 moderate/low findings, all inside `typescript-eslint`'s dependency chain or the `shadcn` CLI's own tooling (`deepmerge`, `ts-morph`, `minimatch`) — dev-tooling only, never shipped to users or the production bundle. **Low**, tracked, not blocking.
- Lockfiles committed: `backend/uv.lock`, `frontend/package-lock.json`.
- Docker images pinned to version tags (`pgvector/pgvector:pg17`, `python:3.12-slim`, `node:22-slim`). Backend and frontend Dockerfiles both create and run as a non-root user.

**3.7 Code quality**
- ruff, ruff format --check, mypy --strict (backend `app/`): clean, no ignores.
- ESLint (flat config) and `tsc --noEmit` (strict): clean, no ignores.
- No business logic exists yet outside `app/core` and `app/api/v1/health.py` — nothing to push into a service layer yet; that structure (`services/`, `schemas/`) is scaffolded empty, ready for Phase 2.
- No dead code, no commented-out code, no unticketed TODOs.
- Backend coverage 84% on `app/` (target is 80%, 85% for `agents/`/`security.py` once those exist — not yet applicable, no agent or auth code in Phase 0).

**3.9 Secrets**
- `.env` is git-ignored (confirmed via `git status` — not listed as untracked, correctly excluded). `.env.example` contains only variable names, no values. `.env.test` contains only fake/placeholder values (`LLM_PROVIDER=fake`, `SEARCH_PROVIDER=fake`, placeholder Clerk test-instance URLs) and is intentionally committed per `TEST_PLAN.md` so CI can use it.
- `gitleaks detect --source . --no-git` (no commits exist yet, so this scanned the working tree): 14 findings, **all** inside `frontend/.next/` (confirmed git-ignored via `git check-ignore`) — these are Next.js's own auto-generated, ephemeral preview-mode encryption/signing keys written to the local build cache, not application secrets, and are never committed. No real finding.
- No secrets appear in logs (structlog output inspected during manual run) or in the frontend bundle (no `NEXT_PUBLIC_*` values are set to anything sensitive yet — only placeholders in `.env.test`).

**Audit summary:** Critical: 0 · High: 0 · Medium: 0 · Low: 1 (dev-only transitive npm advisories, tracked) · **Decision: Go**

## Screenshots
- `docs/phase-reports/phase-0/tp-0.1-landing-1280.png`
- `docs/phase-reports/phase-0/tp-0.1-landing-375.png`
- `docs/phase-reports/phase-0/tp-0.2-dark-theme-1280.png`

## What's needed for Phase 1 (Authentication with Clerk)
- A Clerk application (development instance): `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` for the frontend, and `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUTHORIZED_PARTIES` for the backend — these go in your own `.env` (git-ignored), not committed.
- Two Clerk test users for the e2e suite later (`user-a+clerk_test@example.com`, `user-b+clerk_test@example.com`), credentials in `frontend/.env.test.local` (git-ignored) per `TEST_PLAN.md`.
