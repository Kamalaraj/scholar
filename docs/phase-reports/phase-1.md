# Phase 1 report: Authentication with Clerk
Date: 2026-11-08

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict, eslint, tsc)
- pytest: 14 passed, coverage 92% total, 88% on `app/core/security.py` (target 85%)
- Vitest: 3 passed
- Playwright suite: 3 passed (smoke, TP-1.1, TP-1.2/1.3/1.4 against the real Clerk dev instance)

## Playwright MCP scenarios
The Playwright MCP browser tools were not available in this session. The same scenarios were
run as committed `@playwright/test` specs (`frontend/e2e/auth.spec.ts`) in real Chromium with
`@clerk/testing`, against the running backend and a real Clerk dev instance. Re-run them with
Playwright MCP if you want the exploratory pass.

| ID | Result | Notes |
| --- | --- | --- |
| TP-1.1 | Pass (e2e) | Signed-out `/dashboard` lands on `/sign-in` |
| TP-1.2 | Pass (e2e) | Signed in as user A; dashboard shows user A, `UserButton` visible |
| TP-1.3 | Pass (e2e) | `GET /api/v1/me` 200, `Authorization: Bearer ey...`, email `user-a+clerk_test@example.com` |
| TP-1.4 | Pass (e2e) | After sign-out, `/dashboard` redirects to `/sign-in` |

Not exercised: user B (created, used from Phase 2), console error check by hand.

## Bugs found and fixed
- Backend ignored the repo-root `.env` (settings read `backend/.env`) -> real tokens got 401 because `CLERK_JWKS_URL` was empty -> `config.py` now resolves the root `.env`; the e2e `/me` assertion covers it.
- `ClerkProvider` wrapped `<html>`; current SDKs want it inside `<body>` -> fixed in `app/layout.tsx`.
- Token rejections were silent -> `security.py` now logs `auth_rejected` with the reason (never the token).

## Mini audit (3.1 Authentication, 3.9 Secrets)
| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| A-001 | Low | `.env.test` is tracked, CLAUDE.md says only `.env.example` may be committed. It holds placeholders only. | Open, decide whether to keep |
| A-002 | Low | gitleaks flagged `sk_test_placeholder` in `.env.test` (false positive) | Allow-listed in `.gitleaksignore` |
| A-003 | Low | `python-jose` is a dependency but unused (PyJWT does the work) | Open, remove next phase |

3.1 checklist: every non-health route depends on `get_current_user` (test), RS256 only and `alg:none`
rejected (tests), `exp`/`nbf`/`iss`/`azp` enforced (tests), JWKS cached 1 h and refetched on unknown
`kid` (test), proxy protects `/dashboard`, `/runs`, `/settings`. SSE header-only token: not applicable yet (Phase 4).
3.9: `.env*` ignored, gitleaks clean, `npm audit` 0 vulnerabilities, `pip-audit` clean, secret key only in git-ignored `.env.local`.

## Environment notes
- Postgres host port is 5434 (5432 and 5433 are taken on this machine).
- Clerk dev instance "Scholar": session token claim `email` added via `clerk config patch`.

## Screenshots
- docs/phase-reports/phase-1/tp-1.1-sign-in-1280.png, tp-1.1-sign-in-375.png
- docs/phase-reports/phase-1/tp-1.2-dashboard-1280.png, tp-1.2-dashboard-375.png
