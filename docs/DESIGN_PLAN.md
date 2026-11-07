# Scholar MVP: Design Plan

## 1. Design direction: "the research desk", not a chatbot

Scholar should feel like a calm editorial workspace where a small research team works for you. The user writes a **brief**, reviews a **plan**, watches the **research floor**, and reads a finished **report**. The result is a document, so the interface is built around documents and progress, never around a chat thread.

### What we do not build (the usual AI agent UI)

- No chat bubbles, no message thread, no "Ask me anything" input pinned to the bottom.
- No robot or sparkle icons, no glowing purple gradients, no "AI is thinking..." pulsing dots.
- No raw agent logs or JSON dumped on screen as the main view.
- No full-screen typing animation as the only sign of progress.

### What we build instead

| Idea | Where it shows |
| --- | --- |
| A **brief** you fill in like a form, with examples and depth choice | Dashboard |
| A **plan board** of editable cards you approve, like reviewing an outline | Run page, step 2 |
| A **research floor**: one lane per subquestion, where source cards land as they are found | Run page, step 3 |
| A **progress rail** that shows Brief, Plan, Research, Writing, Report as named stages | Run page, always visible |
| A **report** that reads like a long-form article, with citations in the margin | Run page, step 4 |
| A **library** of past reports, shown like a reading list | Dashboard |

Plain language everywhere. Agents are described by their job ("Searching the web", "Reading 4 sources", "Writing section 2 of 5"), not by internal names like `planner_node`.

## 2. Design principles

1. **Show progress as structure.** The user always knows which stage the run is in, what happened, and what comes next.
2. **The user stays in charge.** Nothing expensive runs before they approve the plan. Every run can be cancelled.
3. **Trust through sources.** Every claim links to where it came from. Sources are visible while research runs, not only at the end.
4. **Calm, not busy.** Animation explains change (a card arriving, a stage completing). Nothing loops forever.
5. **Readable first.** The report is the product. It gets the best typography on the page.
6. **Accessible by default.** WCAG 2.2 AA, full keyboard use, works at 375 px wide.

## 3. Visual language

### Color tokens

Defined as CSS variables in `frontend/app/globals.css` and mapped to the shadcn theme names. Light theme is warm paper; dark theme is warm ink, not pure black.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#FAF8F5` | `#16130F` | Page |
| `--surface` (`--card`) | `#FFFFFF` | `#1F1B16` | Cards, panels |
| `--surface-muted` (`--muted`) | `#F2EEE8` | `#2A251F` | Lanes, inputs |
| `--foreground` | `#1C1915` | `#EDE8E1` | Main text |
| `--muted-foreground` | `#6B645A` | `#A39B8F` | Secondary text |
| `--border` | `#E4DED5` | `#3A342C` | Lines |
| `--primary` (accent) | `#1F5F5B` deep teal | `#5FB3AC` | Main buttons, active stage, links |
| `--primary-foreground` | `#FFFFFF` | `#0F1F1E` | Text on accent |
| `--highlight` | `#F6E7B8` | `#4A3F1E` | Citation hover, new item flash |
| `--success` | `#2E7D4F` | `#5CC28A` | Completed stages |
| `--warning` | `#B26B00` | `#E0A23C` | Needs your action |
| `--destructive` | `#B3261E` | `#F2867E` | Errors, delete |

Rules: one accent color only. Color never carries meaning alone; pair it with an icon or label. Check every text pair for 4.5:1 contrast (3:1 for large text and icons).

### Typography

| Role | Font | Size / line height |
| --- | --- | --- |
| UI text | Inter (variable, `next/font/google`) | 14/20, 16/24 |
| Headings in UI | Inter, weight 600 | 20/28, 24/32 |
| Report body | Source Serif 4 | 18/30, max width 68ch |
| Report headings | Source Serif 4, weight 600 | 28/36 (h1), 22/30 (h2) |
| Data, queries, URLs | JetBrains Mono | 13/20 |

### Space, shape and depth

- 4 px base grid. Common steps: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: 8 px for cards and inputs, 6 px for buttons, full for chips.
- Depth comes from borders and surface color. Shadows only on overlays (dialog, popover, sheet).
- Icons: Lucide, 16 or 20 px, 1.5 stroke.

### Motion

- 150 to 200 ms ease-out for state changes, 250 ms for panels.
- New source card: fade and slide up 8 px, background flashes `--highlight` once.
- Stage complete: the rail dot fills and a check mark draws in.
- Writer streaming: text appears in sentence chunks, with no blinking cursor.
- Respect `prefers-reduced-motion`: turn all of these into simple fades or none.

## 4. Information architecture

| Route | Screen | Purpose |
| --- | --- | --- |
| `/` | Landing | What it does, a short demo, Sign in |
| `/sign-in`, `/sign-up` | Clerk pages | Styled with the tokens through Clerk `appearance` |
| `/dashboard` | Desk | Brief composer and the library of runs |
| `/runs/[id]` | Run workspace | Progress rail plus the current stage (plan, research, report) |
| `/settings` | Settings | Profile (Clerk), theme, daily usage |

App shell: a slim top bar (logo, "New brief" button, theme toggle, Clerk `UserButton`). No left sidebar in the MVP; the library lives on the dashboard.

## 5. Screens

### 5.1 Landing (`/`)

- Headline: "Research briefs, written by a team of agents you direct." Sub-line in plain words.
- A static illustration of the run workspace (the rail, three lanes, a report page). No stock robots.
- Three steps in a row: Write a brief, Approve the plan, Read the cited report.
- Primary button: "Start researching" (goes to sign in).

### 5.2 Desk (`/dashboard`)

Layout: a centered column, 880 px max width.

**Brief composer (top):**
- Label "What do you want to find out?" and a multi-line textarea (3 rows, grows to 8). Placeholder with a real example.
- Below it, three example chips the user can click to fill the box.
- Depth as a segmented control: "Quick, about 3 angles, ~1 min" and "Deep, about 6 angles, ~3 min".
- Primary button "Draft a plan". Disabled until 10+ characters. `Ctrl/Cmd+Enter` submits.

**Library (below):**
- Heading "Your reports" with a search field and a status filter (All, In progress, Needs review, Done, Failed).
- Each row: the question (2 lines max), a status badge, depth, number of sources, relative date. Click opens the run.
- "Needs review" badge uses `--warning` with an icon so it stands out.
- Empty state: a short line and the example chips again. Loading: 5 skeleton rows.

### 5.3 Run workspace (`/runs/[id]`)

Desktop (1280 px): three columns.

```
+---------------------------------------------------------------+
| Top bar                                                       |
+------------+-------------------------------------+------------+
| Progress   | Stage canvas                        | Context    |
| rail       | (Plan board / Research floor /      | panel      |
| 240 px     |  Report)                            | 320 px     |
|            |                                     | (sources,  |
| Brief  ✓   |                                     |  activity) |
| Plan   ●   |                                     |            |
| Research   |                                     |            |
| Writing    |                                     |            |
| Report     |                                     |            |
+------------+-------------------------------------+------------+
```

Tablet: the context panel becomes a toggleable sheet. Mobile (375 px): the rail turns into a horizontal stepper at the top, the canvas is full width, the context panel is a bottom sheet.

**Progress rail**
- Five stages with dot, label, and one status line ("Waiting for you", "3 of 4 angles done", "Writing section 2 of 5").
- The current stage uses `--primary`. A stage that needs the user uses `--warning` and the word "Your turn".
- Under the stages: elapsed time, sources found, Cancel run (ghost destructive button with confirm).

**Stage: Plan board** (status `awaiting_approval`)
- Header: "Here is the plan. Edit anything before research starts."
- The original question at the top in a quiet card.
- Each subquestion is a card: number, editable text (inline, click to edit), the planner's one-line reason in muted text, a drag handle, and delete.
- "Add an angle" dashed card at the end. Max 8.
- Footer bar (sticky): "Ask for a new plan" (opens a small textarea for feedback) and primary "Approve and start research".
- Keyboard: Tab through cards, `Alt+Up/Down` to reorder, `Enter` to edit, `Esc` to cancel an edit.

**Stage: Research floor** (status `researching`)
- One horizontal lane per subquestion (stacked vertically on narrow screens).
- Lane header: the subquestion and a lane status (Searching, Reading, Done) with a small determinate bar (queries done, pages read).
- Inside the lane: query chips ("Searching: ev battery recycling 2026") in mono font, then **source cards** as they arrive: favicon, title, domain, one quoted line.
- A finished lane collapses to a one-line summary with its source count, and can be expanded.

**Stage: Writing and Report** (status `writing`, then `completed`)
- The report appears in the canvas in reading layout as it is written, section by section.
- Above the report: the question as the title, date, depth, number of sources, and the actions Copy and Download .md.
- "Key findings" box at the top with 3 to 5 bullets.
- Citations are small superscript numbers. Hover or focus highlights the matching source card in the context panel; click scrolls to it. On mobile, tap opens the source in a bottom sheet.

**Context panel**
- Tabs: Sources (default) and Activity.
- Sources: numbered cards matching the report's citations.
- Activity: a plain-language timeline of what happened ("10:42 Searched 'x'", "10:43 Read nature.com"). This is where detail lives, kept out of the main view.

### 5.4 Settings

Profile via Clerk, theme (System, Light, Dark), today's run count against the daily limit.

## 6. States

Every screen designs these states explicitly:

| State | Pattern |
| --- | --- |
| Loading | Skeletons in the final layout shape; no full-page spinners |
| Empty | One sentence, one action, and examples where useful |
| Needs action | `--warning` badge plus "Your turn" in the rail, and a toast if the user is on another page |
| Error | Inline card in the stage canvas: what happened in plain words, Retry, and a "details" disclosure with the error id |
| Offline / stream lost | Small banner "Reconnecting..." that clears on its own; data is never lost thanks to replay |
| Cancelled | Grey rail, a note with when it was cancelled, and "Start again with this plan" |
| Rate limited | Friendly message with the reset time |

## 7. Components (shadcn mapping)

| App component | Built from |
| --- | --- |
| `BriefComposer` | Textarea, ToggleGroup, Button, Badge (example chips) |
| `RunsLibrary` | Input, Select, Table or list of Card rows, Badge, Skeleton |
| `ProgressRail` | Custom list + Progress, Tooltip, AlertDialog (cancel) |
| `PlanBoard`, `PlanCard` | Card, Textarea, Button, dnd-kit sortable, AlertDialog |
| `ResearchFloor`, `ResearchLane` | Card, Collapsible, Progress, Badge |
| `SourceCard` | Card, HoverCard, Avatar (favicon) |
| `ReportView` | react-markdown, custom `Citation` button, ScrollArea |
| `ContextPanel` | Tabs, ScrollArea, Sheet (mobile) |
| Notifications | Sonner |
| Layout | Resizable (desktop), Sheet and Drawer (mobile) |

All components live in `frontend/components/research/` and only use design tokens, never raw hex values.

## 8. Accessibility checklist

- Every interactive element reachable and usable with the keyboard, with a visible 2 px focus ring in `--primary`.
- Streaming updates use an `aria-live="polite"` region that announces stage changes only, not every token.
- Citations are buttons with labels like "Source 3: Nature, 2026".
- Drag and drop has a keyboard alternative.
- Touch targets at least 44 x 44 px on mobile.
- Respect reduced motion and the system color scheme.

## 9. Design acceptance (used in Phase 8)

- Screens match this plan at 375, 768 and 1280 px with no horizontal scroll.
- Light and dark themes both pass contrast checks.
- No chat bubbles or "AI" clichés anywhere.
- A first-time user can go from sign-in to a finished report without help (tested with TP-8 scenarios).
