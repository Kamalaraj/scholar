# Scholar MVP: Implementation Plan

Scholar is a multi-agent research assistant. You type a question, a planner agent drafts a research plan, you approve it, parallel research agents search and read sources, and a writer agent produces a cited report. Every agent step streams live to the UI.

The MVP is built in **10 phases (0 to 9)**. Each phase ends with a **phase gate**:

1. All automated checks pass (lint, types, unit tests, Playwright suite).
2. Claude runs the phase's **Playwright MCP scenarios** from [TEST_PLAN.md](./TEST_PLAN.md) in a real browser and records the result.
3. Claude runs the phase's **mini audit** from [AUDIT_PLAN.md](./AUDIT_PLAN.md).
4. The status table below is updated, and Claude gives Kamal a Git handoff (suggested commit message and push commands). Kamal commits and pushes manually; Claude never runs git write commands.

Do not start a phase until the previous gate passes.

## Stack (fixed for the MVP)

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (latest, App Router), TypeScript strict, Tailwind CSS v4, shadcn/ui, TanStack Query |
| Auth | Clerk (`@clerk/nextjs`) on the frontend. FastAPI verifies the Clerk session JWT through JWKS (PyJWT) |
| Backend | FastAPI, Python 3.12, Pydantic v2, uv, SQLAlchemy 2 (async) + Alembic, sse-starlette |
| Agents | LangGraph + LangChain. `langchain-groq` (`ChatGroq`): `llama-3.3-70b-versatile` (strong), `llama-3.1-8b-instant` (fast) |
| Search | Tavily API (`langchain-tavily`); page fetch with httpx + trafilatura |
| Database | Postgres 17 + pgvector in Docker (`pgvector/pgvector:pg17`). LangGraph `AsyncPostgresSaver` checkpointer |
| Testing | pytest, Vitest, `@playwright/test` (committed suite), Playwright MCP (phase gates) |
| Deploy | Vercel (frontend), Render or Fly.io (backend), Neon (Postgres 17) |

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Foundation and tooling | Done |
| 1 | Authentication with Clerk | Done |
| 2 | Database and Runs API | In review |
| 3 | Agent graph core | In review |
| 4 | Live streaming | In review |
| 5 | Plan review (human in the loop) | In review |
| 6 | Report and sources | In review |
| 7 | History, run management and resilience | In review |
| 8 | UI polish, accessibility and full system audit | In review |
| 9 | Deployment and launch | Not started |

---

## Phase 0: Foundation and tooling

**Goal:** an empty but runnable monorepo where every tool works, so later phases only add features.

Tasks:
- Monorepo layout from CLAUDE.md: `backend/`, `frontend/`, `docs/`, `docker-compose.yml`, `.env.example`.
- `docker-compose.yml` with `db` (pgvector/pgvector:pg17, healthcheck, named volume), `backend`, `frontend`.
- Backend: `uv init`, FastAPI app with `GET /api/v1/health` (returns `{status, db}` after a `SELECT 1`), pydantic-settings config, structured logging, CORS limited to `FRONTEND_ORIGIN`.
- Backend tooling: ruff (lint + format), mypy (strict on `app/`), pytest + pytest-asyncio + httpx `AsyncClient`.
- Frontend: `create-next-app` (TS, App Router, Tailwind), `shadcn init`, design tokens from [DESIGN_PLAN.md](./DESIGN_PLAN.md) in `globals.css`, fonts via `next/font`, `next-themes`.
- Frontend tooling: ESLint, Prettier, `tsc --noEmit`, Vitest + Testing Library.
- Playwright: `frontend/e2e/` with `playwright.config.ts` (baseURL `http://localhost:3000`, `webServer` optional), one smoke spec.
- Playwright MCP registered for Claude Code: `claude mcp add playwright -- npx @playwright/mcp@latest`.
- GitHub Actions `ci.yml`: backend (ruff, mypy, pytest with a Postgres 17 service) and frontend (lint, tsc, vitest, build).
- `Makefile` or `justfile` with `dev`, `test`, `lint`, `e2e`, `db-up`, `migrate`.

Exit criteria:
- `docker compose up -d db` then `make dev` starts both apps.
- `GET /api/v1/health` returns `{"status":"ok","db":"ok"}`.
- Landing page renders with the design tokens and theme toggle.
- CI is green.
- Playwright MCP: **TP-0.1 to TP-0.3**.

## Phase 1: Authentication with Clerk

**Goal:** only signed-in users reach the app, and the backend knows who is calling.

Tasks:
- Frontend: `<ClerkProvider>`, `middleware.ts` with `clerkMiddleware()` protecting `/dashboard(.*)`, `/runs(.*)`, `/settings(.*)`. Pages `sign-in/[[...sign-in]]` and `sign-up/[[...sign-up]]` styled with Clerk `appearance` that uses the design tokens.
- `lib/api.ts`: one fetch wrapper that gets `getToken()` and sets `Authorization: Bearer <token>`. Typed errors.
- Backend `core/security.py`: `get_current_user` dependency. It fetches and caches the JWKS from `CLERK_JWKS_URL`, verifies RS256 signature, `exp`, `nbf`, `iss == CLERK_ISSUER`, and `azp` in `CLERK_AUTHORIZED_PARTIES`. It upserts `users` by `clerk_user_id = sub`.
- `GET /api/v1/me`.
- Top bar with Clerk `<UserButton />`.

Exit criteria:
- Without a token every `/api/v1/*` route except `/health` returns 401. A forged or expired token returns 401.
- Unit tests for the JWT check use a locally generated RSA key and a mocked JWKS.
- Playwright MCP: **TP-1.1 to TP-1.4**.

## Phase 2: Database and Runs API

**Goal:** runs exist as data with a clear status machine, before any AI is involved.

Tasks:
- SQLAlchemy models and the first Alembic migration: `users`, `research_runs`, `plan_items`, `run_events`, `sources`, `reports`. The first migration runs `CREATE EXTENSION IF NOT EXISTS vector`.
- Run status enum: `pending, planning, awaiting_approval, researching, writing, completed, failed, cancelled`. Allowed transitions live in one function, with tests.
- Endpoints: `POST /runs`, `GET /runs` (cursor pagination, status filter), `GET /runs/{id}`, `DELETE /runs/{id}`. Every query filters by the current user.
- Pydantic schemas in `app/schemas/`. Export OpenAPI and generate `frontend/lib/api-types.ts` with `openapi-typescript`.
- Frontend: Dashboard with the **Brief composer** (question + depth) and the **Runs list**. Creating a run shows it in the list with status `pending`.

Exit criteria:
- pytest covers CRUD, pagination and ownership (user B gets 404 for user A's run).
- Playwright MCP: **TP-2.1 to TP-2.4**.

## Phase 3: Agent graph core

**Goal:** the LangGraph pipeline produces a report end to end, with a fake mode so tests never call paid APIs.

Tasks:
- `agents/state.py`: `ResearchState`, `SubQuestion`, `Finding`, `Source` (Pydantic).
- `agents/llm.py`: `get_llm("strong" | "fast")`. `LLM_PROVIDER=groq` uses `ChatGroq`. `LLM_PROVIDER=fake` returns scripted LangChain fake chat models.
- `agents/tools/search.py` (Tavily, or a fake that returns fixture results) and `agents/tools/fetch.py` (httpx with timeouts, size limit, SSRF guard, trafilatura text extraction).
- Nodes: `planner` (structured output, 3 subquestions for quick, 6 for deep), `human_review` (`interrupt()`), `research` subgraph (searcher then reader), `writer`, `finalize`. Fan out with `Send`, merge with `operator.add` reducers.
- `agents/graph.py`: build and compile with `AsyncPostgresSaver` (`thread_id = run_id`), created once in the FastAPI lifespan.
- `services/run_service.py`: starts the graph as a background `asyncio` task, updates run status at each node, and saves plan, sources and report to the app tables.
- Groq resilience: retries with exponential backoff on 429 and 5xx, max 3 concurrent research branches, a token budget per run.
- `scripts/run_research.py` CLI to run a question from the terminal.

Exit criteria:
- Graph tests in fake mode: plan is created, graph pauses at `human_review`, resume completes, report cites only collected sources.
- One manual run on Groq + Tavily produces a sensible report (record the cost and time in the phase notes).
- Playwright MCP: **TP-3.1 to TP-3.3**.

## Phase 4: Live streaming

**Goal:** the user watches the agents work in real time, and reloading the page loses nothing.

Tasks:
- `services/event_bus.py`: maps `astream_events(version="v2")` to app events (`node_start`, `node_end`, `plan_ready`, `tool_call`, `source_found`, `token`, `run_completed`, `run_failed`). Each event gets the next `seq` per run, is written to `run_events`, and is published to an in-memory per-run queue.
- `GET /runs/{id}/stream?after_seq=N`: replays from Postgres, then follows the live queue. `EventSourceResponse`, 15 s heartbeat, `X-Accel-Buffering: no`.
- Writer tokens: batch into chunks every 100 ms and store the final text only, so `run_events` does not hold thousands of token rows.
- Frontend `hooks/use-run-stream.ts`: fetch + `eventsource-parser`, fresh Clerk token on every (re)connect, tracks last `seq`, backoff reconnect.
- Run page (`/runs/[id]`) first version: the **Progress rail** and the **Research floor** from the design plan.

Exit criteria:
- Reload mid-run and the timeline rebuilds with no duplicates or gaps.
- Playwright MCP: **TP-4.1 to TP-4.4**.

## Phase 5: Plan review (human in the loop)

**Goal:** the user shapes the research before any search runs.

Tasks:
- `POST /runs/{id}/plan` with `{action: "approve" | "replan", items: [...], feedback?: string}`. Approve resumes the graph with `Command(resume=items)`. Replan sends the feedback to the planner and pauses again.
- Validation: 1 to 8 items, each 5 to 300 characters. Only allowed when status is `awaiting_approval`.
- Frontend **Plan board**: editable subquestion cards, add, delete, drag to reorder (dnd-kit), keyboard reorder, "Ask for a new plan" with feedback, and Approve.
- Optimistic UI with rollback on error.

Exit criteria:
- Edited items are what the research agents actually use (check the events).
- Playwright MCP: **TP-5.1 to TP-5.5**.

## Phase 6: Report and sources

**Goal:** a report that reads like a well-edited article, where every claim leads to its source.

Tasks:
- Writer prompt: cite as `[n]` that maps to `sources.citation_num`. Post-process to drop citations with no matching source.
- Report view: `react-markdown` + `remark-gfm`, serif reading typography, citations rendered as superscript buttons that open the matching **source card** in the margin (or a bottom sheet on mobile).
- Sources panel: title, domain, favicon, the quote used, open link.
- `GET /runs/{id}/report.md` download and Copy to clipboard.
- Summary block ("Key findings", 3 to 5 bullets) at the top of the report.

Exit criteria:
- Every `[n]` in a report links to an existing source. Tested in fake mode.
- Playwright MCP: **TP-6.1 to TP-6.4**.

## Phase 7: History, run management and resilience

**Goal:** the app behaves well when things go wrong or users come back later.

Tasks:
- Library page (`/dashboard`): search by question, filter by status, empty state.
- `POST /runs/{id}/cancel` stops the background task and marks the run `cancelled`. Delete with a confirm dialog.
- Resume after a backend restart: on startup, runs in `researching` or `writing` are resumed from the checkpointer, or marked `failed` with a reason.
- Failure states with a clear message and Retry (creates a new run with the same question and plan).
- Rate limit: max 5 runs per user per day (configurable), with a friendly message.

Exit criteria:
- Kill the backend mid-run, restart, and the run finishes or shows a clear failure.
- Playwright MCP: **TP-7.1 to TP-7.5**.

## Phase 8: UI polish, accessibility and full system audit

**Goal:** the MVP looks finished and passes the full audit.

Tasks:
- Apply every rule in [DESIGN_PLAN.md](./DESIGN_PLAN.md): spacing, typography, loading skeletons, empty states, motion, dark mode, mobile layouts at 375 px.
- Accessibility: axe checks in the Playwright suite, keyboard-only walk-through, focus states, live regions for streaming text.
- Run the **full system audit** in [AUDIT_PLAN.md](./AUDIT_PLAN.md). Write `docs/audits/AUDIT-<date>.md`. Fix every Critical and High finding.

Exit criteria:
- No Critical or High audit findings open. Lighthouse on the dashboard and a finished report: Performance 90+, Accessibility 100, Best Practices 95+.
- Playwright MCP: **TP-8.1 to TP-8.5** and the full regression run (**TP-R**).

## Phase 9: Deployment and launch

**Goal:** a public link that works, plus a README that sells the project.

Tasks:
- Neon Postgres 17 with pgvector; run migrations as a release step.
- Backend on Render or Fly.io (long-lived process, not serverless). Secrets set in the host.
- Frontend on Vercel. Clerk production instance and allowed origins. CORS only for the Vercel domain.
- LangSmith tracing on in production. Health check wired to the host.
- README: demo GIF, architecture diagram, agent graph (`draw_mermaid()`), setup steps, design decisions, measured numbers (time and cost per report).

Exit criteria:
- Playwright MCP against the production URL: **TP-9.1 to TP-9.3**.
- The audit's security and secrets sections are re-run against production.

---

## Out of scope for the MVP

Reviewer agent, follow-up chat with pgvector, PDF upload, PDF export, public share links, scheduled research, LLM-judge evaluation. They are listed in the original plan as stretch goals and start after Phase 9.
