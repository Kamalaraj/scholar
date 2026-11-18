# Scholar Backend

FastAPI service that runs Scholar's multi-agent research pipeline. A LangGraph planner drafts a plan, the user approves it, parallel research agents search and read the web, and a writer agent produces a cited report. Every step is stored as an event and streamed live over SSE.

## Stack

- Python 3.12, [uv](https://docs.astral.sh/uv/), FastAPI, Pydantic v2
- SQLAlchemy 2 (async) + Alembic, Postgres 17 + pgvector
- LangGraph + LangChain, Groq (`langchain-groq`), Tavily search
- Clerk session JWT verified with PyJWT against Clerk's JWKS
- sse-starlette for streaming, structlog for JSON logs, optional Langfuse tracing

## Quick start

```bash
# from the repo root
cp .env.example .env            # fill in values (see Configuration)
docker compose up -d db         # Postgres 17 + pgvector on the port in DATABASE_URL
cd backend
uv sync
uv run alembic upgrade head     # or: make migrate
uv run uvicorn app.main:app --reload --port 8000   # or: make dev-backend
```

- API: http://localhost:8000/api/v1
- Interactive docs: http://localhost:8000/docs
- Health: `GET /api/v1/health` returns `{"status":"ok","db":"ok"}`

Run the graph from the terminal without the API:

```bash
uv run python scripts/run_research.py "your question"
```

## Project layout

```
backend/
├── alembic/            # migrations (every schema change needs one)
├── app/
│   ├── main.py         # app, CORS, lifespan (DB pool + checkpointer)
│   ├── core/           # config, security (Clerk JWT), logging, middleware, tracing
│   ├── db/             # session.py, models.py
│   ├── schemas/        # Pydantic request/response models
│   ├── api/v1/         # runs, stream, users, health (thin handlers)
│   ├── services/       # run_service (status machine), run_executor, event_bus
│   └── agents/
│       ├── graph.py    # LangGraph build + AsyncPostgresSaver
│       ├── llm.py      # get_llm("strong" | "fast"), the only place ChatGroq is created
│       ├── state.py, types.py, budget.py
│       ├── nodes/      # planner, human_review, research, writer, finalize
│       ├── tools/      # search (Tavily or fake), fetch (SSRF-guarded)
│       └── prompts/    # prompt templates
├── scripts/run_research.py
└── tests/
```

Layering: `api → services → agents / db`. Handlers validate, call a service and return a schema. Business logic lives in services.

## API

All routes except `/health` require `Authorization: Bearer <Clerk session JWT>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Liveness + database check (public) |
| GET | `/api/v1/me` | Current user (upserted from the JWT) |
| GET | `/api/v1/me/usage` | Runs used today vs the daily limit |
| POST | `/api/v1/runs` | Create a run and start planning |
| GET | `/api/v1/runs` | List runs (cursor pagination, status filter) |
| GET | `/api/v1/runs/{id}` | Run detail: plan, sources, report |
| POST | `/api/v1/runs/{id}/plan` | Approve or re-plan (`awaiting_approval` only) |
| POST | `/api/v1/runs/{id}/cancel` | Stop the run |
| POST | `/api/v1/runs/{id}/retry` | New run with the same question and plan |
| DELETE | `/api/v1/runs/{id}` | Delete a run |
| GET | `/api/v1/runs/{id}/report.md` | Download the report as Markdown |
| GET | `/api/v1/runs/{id}/stream?after_seq=N` | SSE: replay from Postgres, then follow live |

Other users' runs return 404, never 403.

Run status machine: `pending → planning → awaiting_approval → researching → writing → completed`, plus `failed` and `cancelled`. All transitions go through one function in `services/run_service.py`.

## Configuration

Set in the root `.env` (names only in `.env.example`; never commit real values).

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | e.g. `postgresql+psycopg://scholar:scholar@localhost:5434/scholar` |
| `LLM_PROVIDER`, `SEARCH_PROVIDER` | `groq` / `tavily`, or `fake` for tests |
| `GROQ_API_KEY` / `GROQ_API_KEYS` | One key, or comma-separated keys rotated on rate limits |
| `GROQ_STRONG_MODEL`, `GROQ_FAST_MODEL` | Override model ids |
| `TAVILY_API_KEY` | Search |
| `OPENROUTER_API_KEY` | Optional last-resort fallback |
| `RUN_TOKEN_BUDGET`, `RUN_TIMEOUT_SECONDS`, `MAX_RESEARCH_CONCURRENCY` | Per-run cost and time limits |
| `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_AUTHORIZED_PARTIES` | JWT verification |
| `FRONTEND_ORIGIN` | CORS allow-list |
| `DAILY_RUN_LIMIT` | Default 5 |
| `LANGFUSE_*` | Optional tracing; leave keys empty to disable |

## Testing

Tests use `.env.test` (`LLM_PROVIDER=fake`, `SEARCH_PROVIDER=fake`) so no paid API is ever called.

```bash
uv run pytest                          # everything
uv run pytest tests/agents -k planner  # one area
uv run pytest --cov=app                # coverage (targets: 80% app, 85% agents + security)
```

Coverage includes auth, ownership, the status machine, graph interrupt/resume, citations, the fetch SSRF guard, streaming replay and resource cleanup.

## Quality checks

```bash
uv run ruff check . && uv run ruff format --check . && uv run mypy app   # or: make lint-backend
```

ruff and mypy (strict) must be clean with no blanket ignores.

## Rules to keep in mind

- Create models only through `agents/llm.py`; never import `ChatGroq` elsewhere.
- Web content is untrusted: wrap it in delimiters and never let it trigger tools. The fetch tool keeps its SSRF guard (blocks private, loopback and metadata IPs, limits redirects, size and time).
- Async everywhere: async SQLAlchemy and `httpx.AsyncClient`, no blocking calls in handlers.
- Every run query filters by the current user's id.

## Regenerating frontend types

After changing a schema or route, run `make types` from the repo root to rewrite `frontend/lib/api-types.ts` from the OpenAPI spec.
