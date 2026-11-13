# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Scholar** is a multi-agent research assistant and a portfolio (CV) project. A user writes a research brief, a LangGraph planner drafts a plan, the user approves or edits it, parallel research agents search and read the web, and a writer agent produces a cited report. Every step streams live to the UI.

We are building the **MVP**, phase by phase. The plans below are the source of truth:

- Implementation phases and current status: @docs/IMPLEMENTATION_PLAN.md
- UI and UX rules: @docs/DESIGN_PLAN.md
- Tests and Playwright MCP phase gates: @docs/TEST_PLAN.md
- Mini audits and the full system audit: @docs/AUDIT_PLAN.md

## Stack

- **Frontend:** Next.js (latest, App Router), TypeScript strict, Tailwind v4, shadcn/ui, TanStack Query, Clerk (`@clerk/nextjs`)
- **Backend:** FastAPI, Python 3.12, uv, Pydantic v2, SQLAlchemy 2 async + Alembic, sse-starlette
- **Agents:** LangGraph + LangChain, Groq via `langchain-groq` (`llama-3.3-70b-versatile` strong, `llama-3.1-8b-instant` fast), Tavily search
- **Database:** Postgres 17 + pgvector in Docker (`pgvector/pgvector:pg17`); LangGraph `AsyncPostgresSaver`
- **Auth:** Clerk session JWT sent as `Authorization: Bearer`, verified in FastAPI with PyJWT against Clerk's JWKS
- **Tests:** pytest, Vitest, `@playwright/test`, Playwright MCP

## Repository layout

```
scholar/
├── CLAUDE.md
├── docker-compose.yml        # db (pg17 + pgvector), backend, frontend
├── .env.example
├── Makefile
├── docs/                     # plans, phase-reports/, audits/
├── backend/
│   ├── pyproject.toml, uv.lock, Dockerfile, alembic/
│   ├── app/
│   │   ├── main.py           # app, CORS, lifespan (DB pool + checkpointer)
│   │   ├── core/             # config.py, security.py (Clerk JWT), logging.py
│   │   ├── db/               # session.py, models.py
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── api/v1/           # runs.py, stream.py, users.py, health.py
│   │   ├── services/         # run_service.py, event_bus.py
│   │   └── agents/           # graph.py, state.py, llm.py, nodes/, tools/, prompts/
│   ├── scripts/run_research.py
│   └── tests/
└── frontend/
    ├── app/                  # (marketing)/, dashboard/, runs/[id]/, settings/, sign-in/, sign-up/
    ├── components/ui/        # shadcn generated, do not hand-edit
    ├── components/research/  # BriefComposer, PlanBoard, ResearchFloor, ProgressRail, ReportView, SourceCard ...
    ├── hooks/use-run-stream.ts
    ├── lib/                  # api.ts, api-types.ts (generated), utils.ts
    ├── middleware.ts         # clerkMiddleware
    └── e2e/                  # Playwright suite
```

## Commands

```bash
docker compose up -d db                # Postgres 17 + pgvector on :5432
make dev                               # backend :8000 and frontend :3000
make migrate                           # cd backend && uv run alembic upgrade head
make lint                              # ruff, mypy, eslint, tsc
make test                              # pytest + vitest
make e2e                               # npx playwright test (stack must be running)
make types                             # regenerate frontend/lib/api-types.ts from OpenAPI

cd backend && uv run pytest tests/agents -k planner     # one test area
cd backend && uv run python scripts/run_research.py "question"   # run the graph from the CLI
```

Use `.env.test` (`LLM_PROVIDER=fake`, `SEARCH_PROVIDER=fake`) for tests and phase gates. Only use real Groq and Tavily when a test scenario says "live".

## How to work in this repo

### Phase workflow (always)

1. Read the current phase in `docs/IMPLEMENTATION_PLAN.md`. Work only on that phase.
2. Implement the phase and write tests alongside the code.
3. Run the **phase gate** exactly as `docs/TEST_PLAN.md` section 3 describes: automated checks, then every Playwright MCP scenario for the phase using the Playwright MCP browser tools.
4. Run the phase's **mini audit** from `docs/AUDIT_PLAN.md` section 2. In Phase 8, run the full audit.
5. Write `docs/phase-reports/phase-N.md`, update the status table in the implementation plan, and stop for review before starting the next phase.
6. End with a **Git handoff** for Kamal (see Git below).

Never mark a phase done if a scenario fails or a Critical or High finding is open.

### Backend rules

- Route handlers stay thin: validate, call a service, return a schema.
- Every run-related query filters by the current user's id. Return 404 for other users' runs.
- Every route except `/api/v1/health` depends on `get_current_user`.
- Run status changes go through the single transition function in `services/run_service.py`.
- Create models only through `agents/llm.py` (`get_llm("strong" | "fast")`). Never import `ChatGroq` elsewhere.
- Web content passed to agents is untrusted data: wrap it in delimiters and never let it trigger tools. The fetch tool must keep its SSRF guard.
- Async everywhere (async SQLAlchemy, httpx.AsyncClient). No blocking calls in request handlers.
- Every schema change needs an Alembic migration.

### Frontend rules

- Follow `docs/DESIGN_PLAN.md`. **No chat UI**: no message bubbles, no pinned chat input, no robot or sparkle icons, no purple gradients.
- Use design tokens (CSS variables) only; no hard-coded hex colors in components.
- Use shadcn components from `components/ui/`; add new ones with `npx shadcn@latest add <name>`.
- All API calls go through `lib/api.ts`, which attaches the Clerk token. Types come from `lib/api-types.ts`.
- Every screen handles loading, empty, error and needs-action states.
- Keyboard accessible, visible focus, works at 375 px.

### Testing rules

- Bug fixes start with a failing test.
- E2E tests use `data-testid` only where roles and labels are not enough.
- Never call paid APIs from automated tests.

### Git (Kamal does all git operations manually)

- **Never run** `git commit`, `git push`, `git pull`, `git merge`, `git rebase`, `git checkout -b`, `git switch -c`, `git branch`, `git stash`, or `gh pr create`. Do not create branches or pull requests. Read-only commands (`git status`, `git diff`, `git log`) are fine.
- Remote: https://github.com/Kamalaraj/scholar.git (branch `main`).
- At the end of every phase, give a **Git handoff** block: the list of changed files (from `git status`), a suggested conventional commit message (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) with a short body listing what the phase added, and the exact commands for Kamal to run, for example:

  ```bash
  git add -A
  git commit -m "feat: phase 0 foundation and tooling" -m "- monorepo, docker compose pg17 ..."
  git push origin main
  ```
- Make sure `.env*` files (except `.env.example`) are git-ignored before the handoff, and warn if any secret appears in `git status`.

## Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | backend | `postgresql+psycopg://scholar:scholar@localhost:5434/scholar` locally |
| `GROQ_API_KEY` | backend | Groq console |
| `TAVILY_API_KEY` | backend | Tavily dashboard |
| `LLM_PROVIDER`, `SEARCH_PROVIDER` | backend | `groq`/`tavily` or `fake` |
| `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUTHORIZED_PARTIES` | backend | From the Clerk dashboard |
| `FRONTEND_ORIGIN` | backend | CORS allow-list |
| `DAILY_RUN_LIMIT` | backend | Default 5 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | frontend | Clerk |
| `NEXT_PUBLIC_API_URL` | frontend | `http://localhost:8000/api/v1` locally |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | backend | Optional Langfuse tracing |
