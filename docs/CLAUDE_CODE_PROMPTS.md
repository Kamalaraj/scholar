# Claude Code prompts for the Scholar MVP

Repo: https://github.com/Kamalaraj/scholar.git
Rule for every prompt: Claude Code never commits, pushes, pulls, creates branches or opens PRs. Kamal does all git work manually from the Git handoff Claude gives at the end of each phase.

## Before the first prompt (one time)

```bash
git clone https://github.com/Kamalaraj/scholar.git
cd scholar
# copy CLAUDE.md to the root and the plan files into docs/
git add -A && git commit -m "docs: add CLAUDE.md and MVP plans" && git push origin main
claude mcp add playwright -- npx @playwright/mcp@latest
# have ready: GROQ_API_KEY, TAVILY_API_KEY, Clerk dev keys + JWKS URL, Docker running
claude
```

## Prompt 1: start Phase 0

```text
We are starting the Scholar MVP in this repo (https://github.com/Kamalaraj/scholar.git).
Read CLAUDE.md and every plan it imports (docs/IMPLEMENTATION_PLAN.md,
DESIGN_PLAN.md, TEST_PLAN.md, AUDIT_PLAN.md) before doing anything. These docs
are the source of truth; if something is unclear or conflicts, ask me instead
of guessing.

GIT RULES (strict): Do NOT run git commit, git push, git pull, git merge,
git rebase, git stash, git checkout -b, git switch -c or git branch, and do not
create branches or pull requests (no gh pr create). I do all of that manually.
Read-only git commands (git status, git diff, git log) are fine.

Implement Phase 0 (Foundation and tooling) only.

1. Show me a short task list for Phase 0, then start right away.
2. Build everything listed under Phase 0: monorepo layout, docker-compose with
   pgvector/pgvector:pg17, FastAPI with /api/v1/health, Next.js 15 + shadcn
   with the design tokens and fonts from DESIGN_PLAN.md, ruff/mypy/pytest,
   ESLint/tsc/Vitest, the Playwright suite skeleton, Makefile, .env.example,
   .env.test with fake providers, .gitignore, and GitHub Actions CI.
3. Use current stable versions and check official docs when unsure. Never put
   real secrets in files; ask me to fill .env myself.
4. Run the phase gate exactly as TEST_PLAN.md section 3 says: make lint,
   make test, make e2e, then start the stack and run TP-0.1 to TP-0.3 with the
   Playwright MCP browser tools, saving screenshots to
   docs/phase-reports/phase-0/.
5. Run the Phase 0 mini audit from AUDIT_PLAN.md section 2.
6. Fix anything that fails and re-run until everything passes.
7. Write docs/phase-reports/phase-0.md and update the phase status table in
   IMPLEMENTATION_PLAN.md.
8. Stop and give me:
   - A summary: what was built, gate results, audit findings, and what I need
     to provide for Phase 1 (Clerk keys etc.).
   - A GIT HANDOFF: the changed files from git status, a suggested
     conventional commit message (subject plus a short bullet body), and the
     exact commands for me to run, e.g.
       git add -A
       git commit -m "feat: phase 0 foundation and tooling" -m "- ..."
       git push origin main
     Warn me if any secret or .env file shows up in git status.

Do not start Phase 1 until I say so.
```

## Prompt 2: every next phase (change N and the name)

```text
I have pushed Phase N-1. Start Phase N (<phase name>) from
docs/IMPLEMENTATION_PLAN.md.

GIT RULES (strict): do NOT commit, push, pull, merge, rebase, stash, create
branches or open PRs. Read-only git commands only. I do all git work manually.

Re-read CLAUDE.md and the Phase N section of each plan first. Then: task list,
build with tests, full phase gate (automated checks plus every TP-N.x scenario
through Playwright MCP, with screenshots), the Phase N mini audit, fix and
re-run until green, write docs/phase-reports/phase-N.md, update the status
table. Tell me before you use real Groq or Tavily calls (only "live"
scenarios need them).

Finish with a summary and a GIT HANDOFF: changed files, a suggested
conventional commit message, and the exact git add / commit / push commands
for me to run. Then stop and wait for me.
```

## Prompt 3: full system audit (Phase 8)

```text
Run the full system audit from docs/AUDIT_PLAN.md, all of section 3, following
section 4 step by step, including the attack checks in fake mode. Write
docs/audits/AUDIT-<today>.md from the template. Fix every Critical and High
finding with a regression test, re-run the affected checks and the full
regression TP-R from TEST_PLAN.md.

GIT RULES (strict): no commit, push, pull, branch or PR. Finish with the
summary table, a go/no-go call, and a GIT HANDOFF (changed files, suggested
commit message, exact commands for me).
```

## Prompt for when a session gets long

```text
Summarise where we are in the current phase: done, in progress, failing,
next steps. Save it to docs/phase-reports/phase-N-progress.md so a new
session can continue from it. Do not run any git write commands.
```
