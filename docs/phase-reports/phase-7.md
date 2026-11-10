# Phase 7 report: History, run management and resilience
Date: 2026-11-10

Status: gate passed (TP-7.1 to TP-7.5).

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict on `app/`; eslint and `tsc` clean; `api-types.ts` regenerated)
- pytest: 170 passed, coverage 84% on `app/` (`run_executor.py` 91%, `run_service.py` 81%)
- Vitest: 55 passed (14 new: library filter query, rate-limit messages, stopped/cancelled card, stopped lanes)
- Playwright suite: 24 passed, three runs in a row (adds TP-7.1, TP-7.2, TP-7.4, delete with confirm)

## What was built
**Library** (`/dashboard`): a debounced search box, a status filter (All, In progress, Needs review, Done, Failed or cancelled), "No reports match your search" with a clear button, and a per-row delete behind a confirm dialog (hidden for runs the worker is busy with). Backend: `GET /runs?q=...&status=a&status=b` (case-insensitive, `%` and `_` are literal, max 200 characters, several statuses allowed).

**Cancel**: `POST /runs/{id}/cancel` stops the run's background task (and with it any in-flight search, fetch or model call), then marks the run `cancelled` through the single transition function and emits `run_cancelled`, which closes the stream. 409 for finished runs, 404 for another user's. UI: "Cancel run" under the progress rail with a confirm dialog; the rail turns grey, unfinished lanes say "Stopped", and a card offers "Start again with this plan".

**Retry**: `POST /runs/{id}/retry` (failed or cancelled runs only) creates a new run with the same question, depth and plan. The graph now starts at `human_review` when a plan is supplied, so the planner is not called again and the user still approves before anything is spent.

**Daily limit**: `DAILY_RUN_LIMIT` (default 5) new runs per user per UTC day, counted on run creation and retry. Over the limit the API returns 429 with `Retry-After` and `X-RateLimit-Reset` (exposed through CORS); the UI says "You have started all 5 reports for today. You can start another at 5:30 AM (in about 18 hours)." in local time, inline under the composer and as a toast.

**Resume after a restart** (`recover_inflight_runs`, called in the app lifespan):
- `researching` or `writing` with a checkpoint: resumed from the checkpoint (`run_resumed` event, "Resumed after a server restart" in Activity).
- `researching` but still paused at `human_review` (approval was saved, the server died before research started): research starts from the approved plan.
- Nothing to resume: marked `failed` with "The server restarted and this run could not be resumed. Retry to start again."
- `planning`: marked failed ("restarted while the plan was being drafted"), because the draft is not checkpointed.
- `pending`: starts planning if it is under 10 minutes old, otherwise failed, so an old queue never spends tokens by surprise.
- Assumes one backend process (documented in the function).

**Failure state**: an alert card in plain words, Retry, and a "Details" disclosure with the error id when there is one.

## Playwright MCP scenarios
| ID | Result | Notes |
| --- | --- | --- |
| TP-7.1 | Pass | 20 rows per page with Load more; "Needs review" showed only Needs review rows; a nonsense search showed the empty state and Clear restored the list; "heat pumps" narrowed to matching rows |
| TP-7.2 | Pass | Confirm dialog, "Keep going" left the run alone; Cancel run turned the rail grey, status `cancelled`, "Cancelled just now"; Activity stayed at 9 entries for 5 s afterwards |
| TP-7.3 | Pass | Killed the backend with `kill -9` mid-research and restarted it: log "resuming run from checkpoint", the page reconnected, Activity shows "Resumed after a server restart", the run finished with 6 sources and a report. Second case: killed during planning gave "This run stopped: The server restarted while the plan was being drafted. Retry to start again." with Retry |
| TP-7.4 | Pass | Retry on that failed run opened a new run awaiting approval with 3 angles |
| TP-7.5 | Pass | Backend started with `DAILY_RUN_LIMIT` one above the account's count for the day: first submit worked, second showed the limit message with the reset time (inline and toast), the question stayed in the box and no run was created; the API returned `Retry-After: 66401` and `X-RateLimit-Reset: 2026-11-11T00:00:00+00:00` |

Console: the only errors were requests that failed while the backend was down and the expected 429s.

## Bugs found and fixed
- Alert-dialog confirm buttons did not close the dialog (the generated `AlertDialogAction` is a plain button) -> e2e delete test -> both dialogs are controlled and close on confirm.
- After a cancel, lanes still read "Reading sources" and spun -> found in the MCP screenshot -> `ResearchFloor` takes `stopped`; component tests and an e2e assertion added.
- Recovery gap: a run `researching` but still paused at `human_review` would have resumed, paused again and failed -> `test_restart_between_approval_and_research_starts_research` -> recovery starts research from the approved plan.
- Details disclosure repeated the message when there was no error id -> shown only with an id.
- Logging (audit finding below).

## Mini audit (3.8 Reliability, 3.12 Observability)
- Cancel stops the background task and any in-flight call: tested (task gone, no events after cancel).
- Restart: in-flight runs resume or are marked failed with a reason: tested for all five cases above.
- Fixed (High, 3.12): log lines never contained `run_id`, `user_id` or `error_id`. The executor used stdlib logging with `extra={...}` but the formatter printed only the message, so the "error id" shown to a user could not be found in the logs. `core/logging.py` now has a JSON formatter that keeps `extra` fields and exceptions, and failure logs carry `run_id`, `user_id` and `error_id`. Tests: `test_logging.py`.
- Health check covers the database (unchanged).
- Finding (Low): the daily limit is checked before the insert without a lock, so several simultaneous requests can exceed it by a few.
- Finding (Low): the limit is per UTC day, so the reset moment is midnight UTC (shown in local time).
- Finding (Low): LangSmith tracing and the full "no memory growth after 50 runs" measurement are still open for the Phase 8 full audit.
- Dev note: startup recovery ran against the shared `scholar_test` database and marked about 790 abandoned test rows as failed or resumed them. They were leftovers from earlier test runs.
- Critical/High open: none.

## Screenshots
- docs/phase-reports/phase-7/library-filter-needs-review-1280.png
- docs/phase-reports/phase-7/library-no-results-1280.png
- docs/phase-reports/phase-7/cancel-confirm-1280.png
- docs/phase-reports/phase-7/cancelled-1280.png
- docs/phase-reports/phase-7/resumed-after-restart-1280.png
- docs/phase-reports/phase-7/failed-retry-1280.png
- docs/phase-reports/phase-7/rate-limit-1280.png
