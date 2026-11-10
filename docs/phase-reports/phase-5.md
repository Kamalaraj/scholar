# Phase 5 report: Plan review (human in the loop)
Date: 2026-11-10

Status: gate passed (TP-5.1 to TP-5.5).

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict on `app/`; eslint and `tsc` clean)
- pytest: 152 passed, coverage 86% on `app/` (`human_review.py` 100%)
- Vitest: 30 passed (14 new: plan-item helpers, PlanBoard edit, delete, add, reorder, replan, read-only)
- Playwright suite: 16 passed, three runs in a row (adds TP-5.1 to TP-5.5 and a 375 px plan-board check)

## What was built
- `POST /runs/{id}/plan` takes `{action: "approve" | "replan", items?, feedback?}`. Approve: 1 to 8 items of 5 to 300 characters. Replan: feedback of 3 to 500 characters. Both only from `awaiting_approval` (409 otherwise); another user's run is 404.
- Graph: `human_review` now returns a `Command`. Approve resumes with the items and fans out one research branch per item. Replan resumes with `{"replan": feedback}`, goes back to the planner with the feedback and pauses again. The old conditional edge was removed because it would also fire after a replan.
- New `plan_approved` event carries the approved items, so the Research floor and a page reload show the edited plan, not the planner's draft.
- Re-plans are capped at 5 per run (429 with a message to edit and approve).
- Frontend **Plan board** (`plan-board.tsx`, loaded lazily so dnd-kit is not in the first bundle): editable cards (click or Enter to edit, Enter saves, Esc cancels), planner reason in muted text, drag handle (pointer and dnd-kit keyboard sensor) plus `Alt+Up/Down` reorder with focus kept and an `aria-live` announcement, delete, dashed "Add an angle" (max 8), sticky footer with "Ask for a new plan" (feedback textarea) and "Approve and start research" (disabled with a hint when the plan is empty or a card is invalid).
- Optimistic UI: after Approve the rail and Research floor show the edited lanes immediately; after "Ask for a new plan" the page shows "Drafting the plan". The guess is dropped as soon as any stream event arrives, and rolled back with a toast if the request fails (the board returns with the user's edits intact).

## Playwright MCP scenarios
| ID | Result | Notes |
| --- | --- | --- |
| TP-5.1 | Pass | Rail "Your turn · Waiting for you", status badge "Needs review", 3 editable cards |
| TP-5.2 | Pass | Edited card 2, deleted card 3, added a new card, approved. The floor had exactly 3 lanes with the edited and new text, and the Activity log shows the searches ran on those texts |
| TP-5.3 | Pass | `Alt+ArrowDown` moved angle 1 to position 2, focus stayed on the handle, "Angle moved to position 2 of 3." announced. Mouse drag also worked. The saved order is what the floor used (e2e) |
| TP-5.4 | Pass | "focus on Europe" gave "Drafting the plan", then a new 3-card plan marked "(revised)" and the rail back to "Your turn" |
| TP-5.5 | Pass | Deleting all cards disables Approve and shows "Add at least one angle to approve the plan."; the API returns 422 for `items: []` |
| Extra | Pass | Rollback: with the plan request forced to 409, the optimistic floor showed, then the board returned with the edit ("Edited before failure") and a toast. 375 px: no horizontal scroll, handle and delete buttons 44 px |

Console: no errors during the Phase 5 scenarios.

## Bugs found and fixed
- e2e flake: the run link was matched on a 20-character prefix of a timestamp-based question, so parallel tests opened and approved each other's runs. Questions now carry a random UUID and the full text is matched (stream and plan specs).
- No limit on re-plans (each is a strong-model call) -> `test_replans_are_capped_per_run` -> `MAX_REPLANS = 5`, 429.

## Mini audit (3.3 Input and API, 3.11 Accessibility)
- Request bodies are Pydantic models with length limits (items 5 to 300 chars, 1 to 8 items, feedback 3 to 500); invalid bodies are 422. Tested, including 301-character items.
- Ownership and status are checked before anything runs (404 / 409). Tested.
- Fixed (High, cost can run away): unlimited re-plans, see above.
- Accessibility: every control is a labelled button or textbox, drag has a keyboard alternative, reorder is announced, visible focus rings, 44 px targets at 375 px. The full axe run is Phase 8.
- Finding (Low): deleting a card has no undo or confirm; "Add an angle" restores the count but not the text. Revisit in Phase 8 polish.
- Finding (Low): the token budget applies to each graph segment (plan, re-plan, research), not the whole run. The re-plan cap bounds this for now.
- Critical/High open: none.

## Screenshots
- docs/phase-reports/phase-5/plan-board-1280.png
- docs/phase-reports/phase-5/plan-board-edited-1280.png
- docs/phase-reports/phase-5/replanning-1280.png
- docs/phase-reports/phase-5/rollback-1280.png
- docs/phase-reports/phase-5/zero-cards-1280.png
- docs/phase-reports/phase-5/plan-board-375.png
