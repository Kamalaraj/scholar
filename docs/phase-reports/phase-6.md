# Phase 6 report: Report and sources
Date: 2026-11-10

Status: gate passed (TP-6.1 to TP-6.4).

## Automated checks
- Lint/types: pass (ruff, ruff format, mypy strict on `app/`; eslint and `tsc` clean)
- pytest: 156 passed, coverage 85% on `app/`
- Vitest: 41 passed (11 new: citation linking and URL allow-list, ReportView citations, key findings, raw-HTML and `javascript:` blocking, GFM tables, Copy and Download)
- Playwright suite: 20 passed, three runs in a row (adds TP-6.1 to TP-6.4)

## What was built
- Backend: `GET /runs/{id}/report.md` returns the report as one Markdown file (title, date line, Key findings, body, numbered Sources) with a `Content-Disposition` filename. 404 for another user's run or a run with no report yet, 401 without a token. Source titles are flattened and escaped, and non-http(s) URLs are never turned into links.
- Writer prompt and `finalize` already cite `[n]` and drop numbers with no stored source (Phase 3); this phase adds tests that every `[n]` in the report and in the Key findings maps to a stored source, that numbering is 1..n, and that there are 3 to 5 findings.
- Frontend `ReportView` (react-markdown + remark-gfm, no `rehype-raw`, lazy-loaded): title in Source Serif 4, 18/30, 68ch measure, date, depth and source count, Copy and Download .md (both use the server export), a "Key findings" box, and citations as superscript buttons labelled "Source 3: Title, domain". Unknown `[n]` stay plain text. External links open with `rel="noopener noreferrer"`; `javascript:` and `data:` URLs are dropped.
- Context panel: Sources tab of numbered **source cards** (favicon, domain, title, the quote, "Open source"). Hovering or focusing a citation highlights its card; clicking switches to the Sources tab and scrolls the card into view. Below 1280 px a click opens the source in a bottom sheet instead (Escape closes it).
- Run page: a completed run shows the report first; the Research floor moves into a collapsed "Research details" section. While writing, a status card explains the wait.

## Deviations from the plan
- The report appears when the writer finishes, not section by section (the writer uses structured output; see the Phase 4 report).
- Favicons come from Google's favicon service (`www.google.com/s2/favicons`), with a globe fallback. See the audit finding below. **Decision for Kamal.**
- Swipe-to-close on the mobile sheet is not implemented (Escape and the close button work). TP-6.4 accepts Escape or swipe.

## Playwright MCP scenarios
| ID | Result | Notes |
| --- | --- | --- |
| TP-6.1 | Pass | Source Serif 4 at 18px / 30px, 624px measure at 1400 px, Key findings box with 3 bullets, numbered citations, Copy and Download .md in the header |
| TP-6.2 | Pass | Hovering [2] highlighted source card 2 (and cleared on leave); clicking it scrolled the card into view; the card shows the quote and an "Open source" link with `rel="noopener noreferrer"` |
| TP-6.3 | Pass | Download .md gave `<question-slug>.md`; Copy toast "Report copied as Markdown"; clipboard held the same Markdown (title, Key findings, body, Sources) |
| TP-6.4 | Pass | At 375 px, no horizontal scroll; tapping a citation opened a bottom sheet with Source 1; Escape closed it |

Console: no errors on the final run.

## Bugs found and fixed
- Citation buttons had zero height (Tailwind's `sup { line-height: 0 }` is inherited by the button), so they could not be clicked -> TP-6.1/6.2/6.4 e2e specs failed -> own `leading` on the button.
- Hover-then-click did not work: the parent re-rendered on every hover and handed the report a new `openSource`, so the memoised markdown components changed and React remounted every citation under the cursor -> TP-6.2 e2e -> `openSource` is a `useCallback`, and `ReportView` documents that its handlers must be stable.
- After completion the Research floor pushed the report far down the page -> found in the MCP screenshot -> report first, floor collapsed under "Research details".
- Phase 4 and 5 e2e specs waited for the old "The report is ready" placeholder -> now wait for the report's Key findings heading.
- Citation numbers were about 9px -> `text-[1em]` inside the superscript.
- Exported Sources lines could be hijacked by a malicious page title (`](javascript:…)`, newlines) -> `test_exported_source_lines_cannot_inject_markdown` -> `source_line()` escapes and flattens titles, and only links http(s) URLs.

## Mini audit (3.4 AI safety (output rendering), 3.11 Accessibility)
- Report Markdown renders without raw HTML (`<img onerror>` and `<script>` tests), links get `rel="noopener noreferrer"` and `target="_blank"`, and `javascript:`/`data:` URLs are removed. Tested in Vitest.
- Citations only point to stored sources: finalize strips the rest, the UI leaves unknown numbers as text, and the export lists only stored sources. Tested.
- Fixed (Medium): Markdown injection through source titles in the export, see above.
- Finding (Medium, decision needed): every favicon request tells Google's icon service which domains a user's research touched. Options: keep (current), serve favicons through our backend, or drop them for a letter avatar. Reserved test domains (`.example`, `.test`) are never requested.
- Finding (Low): citation buttons are 14 x 19 px with a hit area of about 33 x 47 px (neighbouring citations overlap). That meets WCAG 2.2 target size (24px) but not the 44 x 44 px goal in the design plan. Revisit in Phase 8.
- Finding (Low): the writer's Key findings can be fewer than 3 if the model returns fewer; the schema only requires 1. The prompt asks for 3 to 5.
- Accessibility: citations are real buttons with labels, hover and focus both highlight, Escape closes the sheet, tabs and details are native or labelled. Full axe run is Phase 8.
- Critical/High open: none.

## Screenshots
- docs/phase-reports/phase-6/report-1400.png
- docs/phase-reports/phase-6/citation-click-1400.png
- docs/phase-reports/phase-6/citation-hover-1400.png
- docs/phase-reports/phase-6/report-dark-1400.png
- docs/phase-reports/phase-6/report-375.png
- docs/phase-reports/phase-6/source-sheet-375.png
