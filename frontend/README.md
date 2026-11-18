# Scholar Frontend

The web app for Scholar. You write a research brief, review and edit the agents' plan, watch the research happen live, then read a cited report. The design is a calm "research desk", not a chatbot: no chat bubbles, no pinned chat input.

## Stack

- Next.js (App Router, Turbopack), React 19, TypeScript strict
- Tailwind CSS v4, shadcn/ui (`components/ui/`), Lucide icons
- TanStack Query for server state
- Clerk (`@clerk/nextjs`) for auth
- dnd-kit for plan reordering, react-markdown + remark-gfm for reports
- `eventsource-parser` for the live SSE stream
- Vitest + Testing Library (unit), Playwright + axe (e2e and accessibility)

## Quick start

```bash
# from the repo root: install and start the backend first (see backend/README.md)
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Or run both apps from the repo root with `make dev`.

## Configuration

Set in the root `.env` (or `frontend/.env.local`):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key (server only) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` locally |

Only `NEXT_PUBLIC_*` values reach the browser.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npm run format` | Prettier check |
| `npm run test` | Vitest unit tests |
| `npx playwright test` | e2e suite (stack must be running) |

From the repo root: `make lint-frontend`, `make test-frontend`, `make e2e`.

## Project layout

```
frontend/
├── app/
│   ├── page.tsx              # landing
│   ├── dashboard/            # desk: brief composer + runs
│   ├── library/              # past reports
│   ├── runs/[id]/            # run workspace (plan, research floor, report)
│   ├── settings/             # profile, theme, daily usage
│   ├── sign-in/, sign-up/    # Clerk pages styled via lib/clerk-appearance.ts
│   └── globals.css           # design tokens (CSS variables)
├── components/
│   ├── ui/                   # shadcn generated, do not hand-edit
│   ├── research/             # BriefComposer, PlanBoard, ResearchFloor, ProgressRail,
│   │                         # ReportView, SourceCard, ActivityPanel, RunActions ...
│   ├── layout/               # app shell, sidebar, mobile nav, auth shell, skip link
│   ├── brand/, marketing/, settings/
│   └── providers.tsx, theme-provider.tsx, theme-toggle.tsx
├── hooks/                    # use-run-stream (SSE + reconnect), use-media-query, ...
├── lib/                      # api.ts, api-types.ts (generated), citations, filters, utils
├── proxy.ts                  # Clerk middleware: protects /dashboard, /runs, /settings
└── e2e/                      # Playwright specs (auth, plan, report, stream, a11y, keyboard ...)
```

## How it fits together

- **Auth:** `proxy.ts` redirects signed-out users to `/sign-in`. `lib/api.ts` is the only place API calls are made; it attaches the Clerk token as `Authorization: Bearer`.
- **Types:** `lib/api-types.ts` is generated from the backend OpenAPI spec. Run `make types` after backend schema changes; don't edit it by hand.
- **Live updates:** `hooks/use-run-stream.ts` opens one SSE connection per run page with fetch (token in the header, never the URL), tracks the last `seq`, and reconnects with backoff. The backend replays missed events, so reloading loses nothing.
- **Plan review:** the plan board supports inline edit, add, delete, drag reorder and `Alt+Up/Down` keyboard reorder, with optimistic updates that roll back on error.
- **Reports:** Markdown is rendered without raw HTML. Citations are buttons that highlight the matching source card (a bottom sheet on mobile).

## Frontend rules

- Follow `docs/DESIGN_PLAN.md`. Use design tokens only; no hard-coded hex colors in components.
- Add shadcn components with `npx shadcn@latest add <name>`.
- Every screen handles loading, empty, error and needs-action states.
- Keyboard accessible, visible focus, works at 375 px, respects reduced motion.
- Prefer roles and labels in tests; use `data-testid` only when needed.

## Testing

```bash
npm run test                 # unit tests, colocated *.test.ts(x)
npx playwright test          # e2e; needs the backend, db and frontend running
```

e2e uses `@clerk/testing/playwright` with test users. Put credentials in `frontend/.env.test.local` (git-ignored). Run the stack in test mode (`LLM_PROVIDER=fake`, `SEARCH_PROVIDER=fake`) so no paid API is called.
