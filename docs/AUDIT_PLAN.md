# Scholar MVP: System Audit Plan

There are two kinds of audit:

- **Mini audit** at the end of every phase: only the sections that the phase touched (table in section 2). Takes about 15 minutes.
- **Full system audit** in Phase 8, and again before any public release: every section below. The result is `docs/audits/AUDIT-YYYY-MM-DD.md`.

## 1. Severity and rules

| Severity | Meaning | Rule |
| --- | --- | --- |
| Critical | Data leak, auth bypass, secret exposed, remote code or SSRF, data loss | Fix before anything else; phase cannot pass |
| High | A core flow breaks, a security weakness with a clear path, WCAG A failure, cost can run away | Fix before the phase passes |
| Medium | Degraded experience, missing hardening, WCAG AA failure, slow page | Fix in the current or next phase |
| Low | Polish, code smell, minor copy issue | Track in the audit file |

Every finding records: id, severity, area, evidence (file:line, screenshot, command output), fix, and status.

## 2. Mini audit per phase

| Phase | Audit sections |
| --- | --- |
| 0 | 3.6 Dependencies, 3.7 Code quality, 3.9 Secrets |
| 1 | 3.1 Authentication, 3.9 Secrets |
| 2 | 3.2 Authorization, 3.3 Input and API, 3.5 Database |
| 3 | 3.4 AI and agent safety, 3.8 Cost and reliability |
| 4 | 3.8 Reliability (streaming), 3.10 Performance (backend) |
| 5 | 3.3 Input and API, 3.11 Accessibility |
| 6 | 3.4 AI safety (output rendering), 3.11 Accessibility |
| 7 | 3.8 Reliability, 3.12 Observability |
| 8 | Everything (full audit) |
| 9 | 3.1, 3.9, 3.13 Deployment, against production |

## 3. Audit checklist

### 3.1 Authentication (Clerk + JWT)
- [ ] Every route except `/health` (and future `/shared/*`) depends on `get_current_user`. Verify by listing routes from `app.routes` in a test.
- [ ] JWT check enforces signature (RS256 only, no `none`), `exp`, `nbf`, `iss`, and `azp`.
- [ ] JWKS is cached with a TTL and refetched on unknown `kid`.
- [ ] Next.js middleware protects every private route; server components never render private data without `auth()`.
- [ ] SSE stream requires the token in the header, not a query string (tokens in URLs end up in logs).

### 3.2 Authorization
- [ ] Every query on runs, plans, events, sources and reports filters by `user_id`. Look for any `session.get(Model, id)` without an owner check.
- [ ] Another user's run returns 404, not 403 (do not reveal it exists).
- [ ] Cancel, delete and plan approval check ownership and current status.

### 3.3 Input and API
- [ ] All request bodies are Pydantic models with length limits (question 10 to 1000 chars, plan items 5 to 300 chars, max 8 items).
- [ ] Errors return a consistent JSON shape with no stack traces.
- [ ] CORS allows only `FRONTEND_ORIGIN`; credentials and methods are limited.
- [ ] Rate limits: run creation per user per day; general request limit per IP.
- [ ] Security headers on the frontend (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`).

### 3.4 AI and agent safety
- [ ] **Prompt injection:** web page text is passed to the reader as quoted data inside clear delimiters, with an instruction to ignore instructions inside it. Agents have no tools that change data or send messages.
- [ ] **SSRF:** the fetch tool only allows `http`/`https`, resolves DNS and blocks private, loopback, link-local and metadata IPs (e.g. `169.254.169.254`), follows at most 3 redirects and rechecks each one.
- [ ] Fetch limits: 10 s timeout, 2 MB max body, HTML and text only.
- [ ] Report Markdown is rendered without raw HTML (`react-markdown` without `rehype-raw`); links get `rel="noopener noreferrer"`.
- [ ] Citations only point to sources stored for that run.
- [ ] The planner's structured output is validated; a bad response retries, then fails the run cleanly.

### 3.5 Database
- [ ] Migrations run clean from empty and are reversible (`alembic downgrade -1` works for the latest).
- [ ] Indexes: `research_runs (user_id, created_at desc)`, `run_events (run_id, seq)` unique, `sources (run_id)`, `plan_items (run_id, position)`.
- [ ] Foreign keys with `ON DELETE CASCADE` from runs to child tables.
- [ ] No N+1 queries on the library and run pages (check SQL logs).
- [ ] The app's database user is not a superuser in production.

### 3.6 Dependencies and supply chain
- [ ] `uv run pip-audit` and `npm audit --omit=dev` show no High or Critical issues.
- [ ] Lockfiles committed (`uv.lock`, `package-lock.json` or `pnpm-lock.yaml`).
- [ ] Docker images pinned to a version tag; backend runs as a non-root user.

### 3.7 Code quality
- [ ] ruff, mypy strict, ESLint and `tsc --noEmit` clean, with no blanket ignores.
- [ ] No business logic in route handlers; services hold it.
- [ ] Types for the frontend API come from the generated OpenAPI types.
- [ ] No dead code, commented-out code, or TODOs without an issue.
- [ ] Coverage meets the targets in TEST_PLAN.md section 5.

### 3.8 Cost and reliability
- [ ] Groq calls retry with backoff on 429 and 5xx; max concurrency for research branches is set.
- [ ] Each run has a token budget and a wall-clock timeout (e.g. 10 min); exceeding it fails the run with a clear reason.
- [ ] Cancel actually stops the background task and any in-flight HTTP calls.
- [ ] Backend restart: in-flight runs resume from the checkpointer or are marked failed.
- [ ] SSE: client disconnect frees the queue subscription; no memory growth after 50 runs (check process memory).
- [ ] Measured and recorded: average time and tokens per quick and deep run.

### 3.9 Secrets
- [ ] `.env*` files git-ignored; `.env.example` has names only.
- [ ] `gitleaks detect` on the full history finds nothing.
- [ ] No secrets in logs, error responses, frontend bundles (only `NEXT_PUBLIC_*` reach the browser) or Langfuse traces.

### 3.10 Performance
- [ ] Lighthouse: Performance 90+, Accessibility 100, Best Practices 95+ on Desk and a finished report.
- [ ] First Load JS for `/dashboard` under 200 KB gzipped; heavy parts (markdown, dnd-kit) loaded lazily.
- [ ] API p95 under 200 ms for list and detail endpoints with 200 runs in the database.
- [ ] Streaming: writer tokens batched (about every 100 ms), not one event per token.

### 3.11 Accessibility and design
- [ ] axe in the Playwright suite reports zero violations on every page.
- [ ] Keyboard-only journey passes (TP-8.2).
- [ ] Contrast checked for both themes.
- [ ] Screens match DESIGN_PLAN.md; no chat-style UI patterns.

### 3.12 Observability
- [ ] Structured JSON logs with `run_id` and `user_id` on every line about a run.
- [ ] Each error shown to users carries an error id that appears in the logs.
- [ ] Langfuse tracing can be turned on with an env var.
- [ ] Health check covers the database.

### 3.13 Deployment
- [ ] HTTPS only; HSTS on.
- [ ] Production Clerk instance; authorized parties set to the Vercel domain.
- [ ] Migrations run as a release step, not on every request.
- [ ] Backups enabled on Neon; restore tested once.
- [ ] README setup steps work on a clean machine.

## 4. How Claude runs the full audit

1. Create `docs/audits/AUDIT-YYYY-MM-DD.md` from the template below.
2. Go through sections 3.1 to 3.13. For each item, gather evidence: run the command, read the code, or check in the browser with Playwright MCP.
3. Run these commands and attach the summaries:
   - `uv run ruff check . && uv run mypy app && uv run pytest --cov=app`
   - `uv run pip-audit`
   - `npm run lint && npx tsc --noEmit && npm run test && npx playwright test`
   - `npm audit --omit=dev`
   - `gitleaks detect --source .`
   - Lighthouse via `npx lighthouse <url> --preset=desktop` and with mobile settings.
4. Try the attacks yourself in fake mode: another user's run id, a forged JWT, a brief that tells the agents to fetch `http://169.254.169.254/`, a fixture page containing "ignore previous instructions", a 5 MB page.
5. Record each finding with severity and evidence. Fix Critical and High, add a regression test for each, and re-run the affected checks.
6. Summarise at the top: counts by severity, what was fixed, what remains, and the go or no-go call for the phase.

## 5. Audit report template

```markdown
# Audit YYYY-MM-DD (Phase N)

## Summary
Critical: 0 · High: 0 · Medium: 0 · Low: 0
Decision: Go | No-go

## Findings
| ID | Severity | Area | Finding | Evidence | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A-001 | High | 3.4 SSRF | Fetch tool follows redirect to 127.0.0.1 | tests/agents/test_fetch.py::test_redirect | Recheck IP after each redirect | Fixed |

## Command output summaries
...

## Checklist results
(Copy section 3 with each box ticked or a finding id next to it)
```
