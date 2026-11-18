# Phase 3 report: Agent graph core
Date: 2026-11-08

Status: gate passed (TP-3.1, TP-3.2, TP-3.3).

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict on `app/`; frontend eslint and `tsc` clean)
- pytest: 139 passed, coverage 84% on `app/` (agents 79-100% per file; `security.py` 88%)
- Vitest: 9 passed
- Playwright suite: not re-run this phase (no frontend changes besides regenerated `api-types.ts`)

## What was built
- `agents/`: state, `get_llm` (Groq or scripted fake), Tavily search and SSRF-guarded fetch, planner, `human_review` (`interrupt`), research subgraph (searcher then reader, fanned out with `Send`), writer, finalize, token budget.
- `graph.py` compiled with `AsyncPostgresSaver` in the FastAPI lifespan (`thread_id = run_id`). Tests use `InMemorySaver`.
- `services/run_executor.py`: background asyncio tasks, status changes through `transition_run`, token budget plus 10 min timeout, failures stored with an error id.
- API: `POST /runs` now starts planning; `POST /runs/{id}/plan` (approve, optional edited items, 1-8 items of 5-300 chars, 409 unless `awaiting_approval`); `GET /runs/{id}` returns plan, sources and report.
- `scripts/run_research.py` CLI.

## Playwright MCP scenarios
| ID | Result | Notes |
| --- | --- | --- |
| TP-3.1 | Pass | Signed in as user A, example chip, Draft a plan. Run reached `awaiting_approval` with 3 plan items within seconds. My poll started late, so `pending` and `planning` were not observed live (covered by tests) |
| TP-3.2 | Pass | Approve called with the signed-in session's token from the page (`fetch`), not the Swagger UI. Status `researching`, `writing`, `completed`; 6 sources, report and key findings present; second approve returned 409 (the only console error) |
| TP-3.3 | Pass (live, CLI) | See below |

### TP-3.3 live run (Groq + Tavily, CLI)
- Quick brief on EV battery recycling: 3 sub-questions, 6 sources, report on topic, every `[n]` maps to a collected source.
- Time 22.9 s, 11,806 tokens.
- **Model finding:** `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` returned 404 `model_not_found` for this key; the key lists `openai/gpt-oss-120b`, `openai/gpt-oss-20b` and `qwen/qwen3.8-27b` instead. The run used `openai/gpt-oss-120b` (strong) and `openai/gpt-oss-20b` (fast) through the new `GROQ_STRONG_MODEL` / `GROQ_FAST_MODEL` settings. Defaults still follow CLAUDE.md. **Decision needed from Kamal.**

## Bugs found and fixed
- Research branch returned its input keys to the parent, causing `InvalidUpdateError` -> branch output schema (`BranchOutput`); covered by `test_graph.py`.
- Returning a run after commit hit a lazy-load of `updated_at` -> refresh before responding; covered by `test_run_flow.py`.

## Mini audit (3.4 AI and agent safety, 3.8 Cost and reliability)
- Prompt injection: page text is wrapped in `<untrusted_web_content>`, the closing tag is stripped from page text, agents have no tools. Tested.
- SSRF: http(s) only, DNS resolved and all addresses must be public, redirects re-checked (max 3), 10 s timeout, 2 MB cap, text/html only. Tested with private, loopback, link-local, IPv6-mapped, redirect and oversize cases.
- Citations: invalid `[n]` are stripped in `finalize`; tested.
- Planner/reader/writer output is validated, retried once, then the run fails cleanly (tested).
- Retries: `ChatGroq(max_retries=3)` (Groq SDK backoff on 429/5xx); concurrency capped at 3 via `max_concurrency`; token budget and timeout tested (budget).
- **Medium:** DNS is resolved in the guard and again by httpx at connect time, so DNS rebinding is not fully closed. Fix later by pinning the resolved IP in a custom transport.
- **Medium:** the budget counts per graph segment (planning, then research), not across a restart.
- **Low:** `pip-audit` is not installed in the project, so the dependency audit was not run.
- Open for Phase 7: cancel, and resume after a backend restart.

Critical: 0 · High: 0 · Medium: 2 · Low: 1

## Screenshots
- docs/phase-reports/phase-3/dashboard-after-run.png (1280 px; no new UI this phase)
