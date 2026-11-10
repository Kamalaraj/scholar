import type { components } from "@/lib/api-types";

type Status = components["schemas"]["RunStatus"];

export type StatusFilter = "all" | "in_progress" | "needs_review" | "done" | "failed";
export type RunFilters = { q?: string; status?: StatusFilter };

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "needs_review", label: "Needs review" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed or cancelled" },
];

const STATUSES: Record<StatusFilter, Status[]> = {
  all: [],
  in_progress: ["pending", "planning", "researching", "writing"],
  needs_review: ["awaiting_approval"],
  done: ["completed"],
  failed: ["failed", "cancelled"],
};

/** Query string for `GET /runs`: paging cursor, text search and the statuses behind a filter. */
export function runsQuery(cursor: string | null | undefined, filters: RunFilters): string {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const q = filters.q?.trim();
  if (q) params.set("q", q);
  for (const status of STATUSES[filters.status ?? "all"]) params.append("status", status);
  return params.toString();
}

export const hasActiveFilters = (filters: RunFilters) =>
  Boolean(filters.q?.trim()) || (filters.status ?? "all") !== "all";
