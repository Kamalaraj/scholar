# Phase 2 report: Database and Runs API
Date: 2026-11-08

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict, eslint, tsc, prettier)
- pytest: 109 passed, coverage 92% total (`run_service.py` 93%, `security.py` 88%)
- Vitest: 9 passed
- Playwright suite: 7 passed (smoke, TP-1.x, TP-2.1 to TP-2.4) against the real Clerk dev instance
- `alembic check`: no drift. Migration upgrade, downgrade, upgrade verified.

## Playwright MCP scenarios
The Playwright MCP browser tools are not available in this session, so the scenarios ran as committed
`@playwright/test` specs in `frontend/e2e/runs.spec.ts` (real Chromium, real Clerk sign-in, real backend).

| ID | Result | Notes |
| --- | --- | --- |
| TP-2.1 | Pass (e2e) | 5 characters keeps "Draft a plan" disabled |
| TP-2.2 | Pass (e2e) | Example chip + Deep + submit: new top row, "Queued", "Deep", box cleared |
| TP-2.3 | Pass (e2e) | User B opening user A's run URL sees "Report not found", none of A's text; API returns 404 (pytest) |
| TP-2.4 | Pass (e2e) | 375 px: no horizontal overflow; submit, depth toggles and chips are at least 44 px tall |

Not exercised by hand: console and network error sweep.

## What was built
- Models and migration: `research_runs`, `plan_items`, `run_events`, `sources`, `reports` (plus `CREATE EXTENSION vector`).
- Status machine: one `transition_run` in `services/run_service.py`, all 64 status pairs tested.
- `POST/GET/DELETE /api/v1/runs`, `GET /api/v1/runs/{id}`: cursor pagination (created_at, id), status filter,
  `source_count` from one subquery, ownership via the query itself (other users get 404).
- Frontend: Brief composer (chips, depth toggle, Ctrl/Cmd+Enter), Runs library (skeletons, empty, error, load more),
  minimal run page with a not-found state, generated `lib/api-types.ts`, Sonner toasts.

## Decisions worth knowing
- Enums are stored as VARCHAR, not native Postgres enums, so new statuses never need `ALTER TYPE`.
- The pgvector extension is created in this migration, not the first one (`users` was already merged in Phase 1).
- Delete is refused with 409 while a run is planning, researching or writing (cancel first, Phase 7).
  Runs sit in `pending` until the graph exists (Phase 3), which is expected.
- The top bar shows the account email (calls `/me`), which keeps TP-1.3 observable.

## Bugs found and fixed
- Selected depth was only a faint background change (colour-only signal) -> `aria-pressed` border added.
- Dashboard rewrite removed the `/me` call that TP-1.3 depends on -> caught by the Phase 1 e2e test -> email label restored in the top bar.

## Mini audit (3.2 Authorization, 3.3 Input and API, 3.5 Database)
No Critical or High findings.

| ID | Severity | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| A-004 | Medium | 3.3 | No security headers (CSP, nosniff, Referrer-Policy, frame-ancestors) on the frontend | Open, Phase 8 |
| A-005 | Medium | 3.3 | No rate limits yet (per-user daily limit is Phase 7; no per-IP limit planned) | Open, Phase 7 |
| A-006 | Low | 3.3 | 422 validation errors use FastAPI's list shape, other errors use `{"detail": str}` | Open, Phase 8 |
| A-007 | Low | 3.3 | `/docs` and `/openapi.json` are public | Open, decide before Phase 9 |
| A-001..003 | Low | Phase 1 | `.env.test` tracked, gitleaks false positive allow-listed, unused `python-jose` | Open |

Checks passed: every runs query filters by `user_id` (no unscoped `db.get`), other users get 404 for get and delete,
request bodies are Pydantic models with 10 to 1000 character limits, CORS limited to `FRONTEND_ORIGIN`, required indexes
and `ON DELETE CASCADE` foreign keys exist, cascade tested, no N+1 (query-count test), migration reversible.
Deferred to Phase 9: non-superuser database role.

## Screenshots
docs/phase-reports/phase-2/: tp-2.2-desk-1280.png, tp-2.4-desk-375.png, tp-2.3-not-found-1280.png, empty-state-1280.png
(taken before the depth-toggle border fix; the toggle now has a visible selected border)
