# Scholar MVP: Test Plan

Every phase in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) ends with a gate. This file says what runs at each gate and how.

## 1. Test layers

| Layer | Tool | Where | Runs |
| --- | --- | --- | --- |
| Backend unit + API | pytest, pytest-asyncio, httpx `AsyncClient` | `backend/tests/` | Every commit (CI) |
| Agent graph | pytest with `LLM_PROVIDER=fake`, `SEARCH_PROVIDER=fake` | `backend/tests/agents/` | Every commit (CI) |
| Frontend unit | Vitest + Testing Library | `frontend/**/*.test.tsx` | Every commit (CI) |
| End-to-end suite | `@playwright/test` | `frontend/e2e/` | Every phase gate, and CI on `main` |
| Exploratory browser check | **Playwright MCP**, driven by Claude | No files; results go in the phase report | Every phase gate |
| Accessibility | `@axe-core/playwright` inside the e2e suite | `frontend/e2e/a11y.spec.ts` | Phase 8 onward |
| Live smoke | Playwright MCP with real Groq + Tavily | Manual, once per phase from Phase 3 | Phase gate only |

Why both Playwright layers: the committed suite catches regressions automatically, and the MCP check lets Claude look at the real page, catch layout and copy problems a script would miss, and turn new findings into committed tests.

## 2. Setup

### Playwright MCP for Claude Code

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

Claude then has browser tools (navigate, click, type, snapshot, screenshot, console messages, network requests). Use the **accessibility snapshot** to find elements; use screenshots for layout checks at 375, 768 and 1280 px.

### Test mode (no paid API calls)

Set in `.env.test` and used by CI and phase gates unless a scenario says "live":

```
LLM_PROVIDER=fake          # scripted LangChain fake chat models
SEARCH_PROVIDER=fake       # fixture search results and pages
FAKE_STEP_DELAY_MS=300     # slows fake agents so streaming is visible
DAILY_RUN_LIMIT=1000
```

The fake planner always returns 3 subquestions for "quick". The fake writer cites sources 1 to 3. This makes assertions stable.

### Clerk in tests

- Use a Clerk **development** instance and two test users (`user-a+clerk_test@example.com`, `user-b+clerk_test@example.com`). Clerk test emails accept the code `424242`.
- The e2e suite uses `@clerk/testing/playwright` (`clerkSetup()` in global setup, `clerk.signIn()` in tests) so it skips bot protection.
- In Playwright MCP sessions, sign in through the real UI with the test user.
- Credentials live in `frontend/.env.test.local` (git-ignored), never in docs or commits.

### Start the stack for a gate

```bash
docker compose up -d db
make migrate
make dev          # backend :8000, frontend :3000, using .env.test
```

## 3. Phase gate procedure (Claude follows this every time)

1. Run `make lint test` and `make e2e`. Stop and fix if anything fails.
2. Start the stack in test mode.
3. Run the phase's Playwright MCP scenarios below, in order. For each: follow the steps, check the expected result, check the browser console has no errors and no failed network requests (except expected 401/404 checks).
4. Take screenshots at 1280 px (and 375 px from Phase 2) of each new screen and save them to `docs/phase-reports/phase-N/`.
5. Turn every new bug into a failing Playwright or pytest test, fix it, then re-run.
6. Write `docs/phase-reports/phase-N.md` using the template in section 6.
7. Update the phase status table in IMPLEMENTATION_PLAN.md.

## 4. Playwright MCP scenarios by phase

### Phase 0: Foundation

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-0.1 | Open `http://localhost:3000` | Landing renders, no console errors, fonts load (Inter, Source Serif 4) |
| TP-0.2 | Toggle theme light, dark, system | Background and text colors switch to the dark tokens; choice survives reload |
| TP-0.3 | Open `http://localhost:8000/api/v1/health` | JSON `{"status":"ok","db":"ok"}` |

### Phase 1: Auth

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-1.1 | Signed out, open `/dashboard` | Redirect to `/sign-in` |
| TP-1.2 | Sign in as user A | Lands on `/dashboard`; `UserButton` shows user A |
| TP-1.3 | While signed in, watch network for `GET /api/v1/me` | 200 with user A's email; request has a Bearer header |
| TP-1.4 | Sign out from `UserButton`, then go back | Protected pages redirect to sign-in again |

### Phase 2: Runs API and Desk

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-2.1 | On Desk, type a 5-character question | "Draft a plan" stays disabled |
| TP-2.2 | Click an example chip, choose Deep, submit | New row appears at the top of "Your reports" with the question and status |
| TP-2.3 | Sign in as user B, open user A's run URL | Not-found page, no data from user A |
| TP-2.4 | Resize to 375 px | Composer and library fit, no horizontal scroll, touch targets 44 px |

### Phase 3: Agent graph core

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-3.1 | Submit a brief in fake mode, wait | Status moves `pending`, `planning`, `awaiting_approval` within 5 s (refresh allowed in this phase) |
| TP-3.2 | Approve the plan through `/docs` (Swagger) `POST /runs/{id}/plan` | Status reaches `completed`; `GET /runs/{id}` has a report and 3+ sources |
| TP-3.3 | **Live:** one quick brief with Groq + Tavily | Completes in under 3 min; report is on topic; note time and token count |

### Phase 4: Live streaming

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-4.1 | Open a new run page right after submitting | Progress rail stages update without reload; Activity tab fills in order |
| TP-4.2 | Reload the page mid-research | Same events shown once each, no gaps (compare `seq` in network responses) |
| TP-4.3 | Throttle network to offline for 10 s, then online | "Reconnecting..." banner shows and clears; stream resumes |
| TP-4.4 | Check network tab | One SSE connection per run page; heartbeats every ~15 s; token in header, not URL |

### Phase 5: Plan review

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-5.1 | Run reaches the plan stage | Rail shows "Your turn"; Plan board lists 3 editable cards |
| TP-5.2 | Edit card 2 text, delete card 3, add a new card, approve | Research floor shows exactly those 3 lanes with the edited text |
| TP-5.3 | Reorder using only the keyboard (`Alt+Down`) | Order changes and is announced; saved order used on approve |
| TP-5.4 | "Ask for a new plan" with feedback "focus on Europe" | New plan appears; status back to `awaiting_approval` |
| TP-5.5 | Try to approve with 0 cards | Approve disabled with a hint; API returns 422 if forced |

### Phase 6: Report and sources

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-6.1 | Finish a run | Report renders with serif type, Key findings box, numbered citations |
| TP-6.2 | Hover then click citation [2] | Source 2 card highlights and scrolls into view in the context panel |
| TP-6.3 | Click Download .md and Copy | File downloads with the report; clipboard holds the Markdown; toast confirms |
| TP-6.4 | At 375 px tap a citation | Bottom sheet with the source opens and closes with Esc or swipe |

### Phase 7: History and resilience

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-7.1 | Desk with 6+ runs: search and filter by "Needs review" | List narrows correctly; empty result shows the empty state |
| TP-7.2 | Cancel a run during research | Confirm dialog; rail turns grey; status `cancelled`; no new events arrive |
| TP-7.3 | Stop the backend mid-run, restart it | Run continues or shows a clear failure with Retry |
| TP-7.4 | Click Retry on a failed run | New run with the same question and plan starts |
| TP-7.5 | Set `DAILY_RUN_LIMIT=1`, submit twice | Second submit shows the limit message with reset time |

### Phase 8: Polish, accessibility, audit

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-8.1 | Full journey at 1280, 768 and 375 px, light and dark | Matches DESIGN_PLAN; no overflow; screenshots saved |
| TP-8.2 | Full journey with keyboard only | Every action possible; focus always visible; no focus traps |
| TP-8.3 | Enable reduced motion in the browser | No slide or pulse animations |
| TP-8.4 | Check the page for chat-style UI | No chat bubbles, no pinned chat input, no robot or sparkle icons |
| TP-8.5 | Run Lighthouse on Desk and a finished report | Performance 90+, Accessibility 100, Best Practices 95+ |

### Phase 9: Production

| ID | Scenario | Expected |
| --- | --- | --- |
| TP-9.1 | On the production URL: sign up, run a quick brief, approve, read report | Works end to end with Groq; no console errors |
| TP-9.2 | Check response headers and CORS from a different origin | Security headers present; other origins blocked |
| TP-9.3 | Open the app after the backend has been idle | First load shows a friendly waking state, then works |

### TP-R: Full regression (Phase 8 and before every release)

Run the whole `@playwright/test` suite, then Playwright MCP scenarios TP-1.2, TP-2.2, TP-4.2, TP-5.2, TP-6.2 and TP-7.2 back to back as one user journey.

## 5. Automated test coverage targets

| Area | Must cover |
| --- | --- |
| Auth | Valid, expired, wrong issuer, wrong `azp`, missing token, JWKS rotation |
| Ownership | Every `/runs/{id}*` route returns 404 for another user's run |
| Status machine | Every allowed and forbidden transition |
| Graph (fake) | Plan creation, interrupt, resume with edited plan, replan, writer citations only from sources |
| Fetch tool | Blocks private IPs, localhost, file URLs; size and timeout limits |
| Streaming | Replay after `seq`, no duplicates, heartbeat, client disconnect cleans up |
| Frontend | `useRunStream` reconnect, PlanBoard edit/reorder, Citation to source mapping |

Backend line coverage target: 80% on `app/` (85% on `app/agents/` and `app/core/security.py`).

## 6. Phase report template

```markdown
# Phase N report: <name>
Date: YYYY-MM-DD

## Automated checks
- Lint/types: pass | fail
- pytest: X passed, coverage Y%
- Vitest: X passed
- Playwright suite: X passed

## Playwright MCP scenarios
| ID | Result | Notes |
| --- | --- | --- |
| TP-N.1 | Pass | |

## Bugs found and fixed
- <bug> -> <test added> -> <fix commit>

## Mini audit (from AUDIT_PLAN.md)
- <findings or "none">

## Screenshots
- docs/phase-reports/phase-N/<name>.png
```
