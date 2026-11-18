# Phase 4 report: Live streaming
Date: 2026-11-10

Status: gate passed (TP-4.1 to TP-4.4).

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict on `app/`; eslint and `tsc` clean)
- pytest: 148 passed, coverage 86% on `app/` (`event_bus.py` 100%, `stream.py` 76%: the idle-timeout branches of the follow loop are not unit-tested)
- Vitest: 16 passed (event reducer, stage derivation, `useRunStream` resume-after-drop)
- Playwright suite: 10 passed (adds TP-4.1, TP-4.2 and a 375 px overflow check)

## What was built
- `services/event_bus.py`: per-run `seq`, stored in `run_events` first, then published to in-memory subscriber queues. Replay plus live follow never loses an event; duplicates are dropped by `seq`.
- `transition_run` (still the only place status changes) emits `status`, `run_completed` and `run_failed`.
- `run_executor` runs the graph through `astream_events(version="v2")` and maps it to `node_start`, `node_end`, `plan_ready`, `tool_call`, `source_found`. Searcher and reader send `tool_call` and `source_found` as custom events.
- `GET /runs/{id}/stream?after_seq=N`: ownership check (404), Bearer header only, 15 s heartbeat, `X-Accel-Buffering: no`, ends when the run does, unsubscribes on disconnect.
- Frontend: `lib/run-events.ts` (pure reducer), `hooks/use-run-stream.ts` (fetch + `eventsource-parser`, fresh Clerk token per connect, resumes from last `seq`, backoff), Progress rail, Research floor with source cards, Sources/Activity tabs, "Reconnecting…" banner. Replaces the Phase 2 run summary.

## Deviations from the plan
- No `token` events: the writer uses structured output, so there is nothing to stream token by token. The report appears when the run completes. Revisit in Phase 6 if the writer moves to streamed text.
- The plan is shown read-only; approving is still API-only until Phase 5 (the e2e tests and MCP runs approve with the page's session token).

## Playwright MCP scenarios
| ID | Result | Notes |
| --- | --- | --- |
| TP-4.1 | Pass | Rail went from "Your turn · Waiting for you" to done with no reload; Activity tab filled in order; research lanes showed query chips then source cards |
| TP-4.2 | Pass | Reloaded while the rail read "0 of 3 angles done"; the rebuilt Activity list had 18 entries, one "Drafted a plan", one "Report is ready" |
| TP-4.3 | Pass | Chromium offline mode does not cut an already open stream, so the drop was simulated by stopping the backend: banner appeared, cleared after restart, stream resumed and the run finished with no duplicates |
| TP-4.4 | Pass | One `/stream` request per page, `Authorization` header, URL has only `after_seq`; a heartbeat (`: ping`) arrived at 15 s |

Console: the only errors were Clerk token refreshes failing during the deliberate offline test, and fetches failing while the backend was stopped.

## Bugs found and fixed
- `astream_events` made the fake chat model stream, which raised `NotImplementedError` -> fake model now streams one chunk (all graph tests).
- Streaming also bypassed the fake step delay, so `FAKE_STEP_DELAY_MS` stopped slowing agents -> `test_fake_step_delay_applies_when_streaming` -> `_astream` keeps the delay.
- Streaming leaked the whole branch state into the parent graph (`InvalidUpdateError` on `question`) -> research branch is now a node that returns only `findings` and `sources` (`test_stream.py`, `test_run_flow.py`).
- Run page overflowed horizontally at 375 px: grid item without `min-w-0`, and `sr-only` labels escaping the scrolling stepper -> e2e test "run page fits at 375 px" -> `min-w-0` on the nav, `relative` on the list.
- TP-2.2 e2e expected "Queued"; since Phase 3 the run is already "Planning" -> test accepts both.

## Mini audit (3.8 Reliability (streaming), 3.10 Performance (backend))
- Token only in the `Authorization` header; the stream URL carries `after_seq` only (3.1 check also holds).
- Client disconnect: `_follow` unsubscribes in `finally`; channels are dropped once idle, and a new `seq` counter is rebuilt from `max(seq)` in the database.
- Replay and live follow cannot gap: subscribe, then replay, then follow, skipping `seq <= last`; a gap sends it back to the database.
- Writer token batching: not applicable (see deviations).
- Finding (Low): each open stream checks run status every 5 s while idle. Fine for the MVP; revisit if many viewers.
- Finding (Low): `transition_run` emits events after its commit, so a database error there would fail the run after the status already changed. Acceptable now; the Phase 7 resume logic should cover it.
- Not measured: process memory after 50 runs (3.8) and the 200-run API p95 (3.10); both are listed for the Phase 8 full audit.
- Critical/High open: none.

## Screenshots
- docs/phase-reports/phase-4/plan-waiting-1280.png
- docs/phase-reports/phase-4/research-floor-1280.png
- docs/phase-reports/phase-4/completed-1280.png
- docs/phase-reports/phase-4/completed-375.png
- docs/phase-reports/phase-4/reconnecting-1280.png
