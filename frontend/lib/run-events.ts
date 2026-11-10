import type { RunStatus } from "@/lib/api";

/** One event from `GET /runs/{id}/stream`. */
export type RunEvent = {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type PlanEntry = { text: string; reason: string | null };
export type LaneSource = { url: string; title: string; domain: string; quote: string | null };
export type LanePhase = "waiting" | "searching" | "reading" | "done";
export type Lane = {
  index: number;
  phase: LanePhase;
  queries: string[];
  pagesRead: number;
  sources: LaneSource[];
};
export type ActivityEntry = { seq: number; at: string; text: string };

export type RunView = {
  lastSeq: number;
  status: RunStatus | null;
  plan: PlanEntry[];
  lanes: Lane[];
  activity: ActivityEntry[];
  sourceCount: number;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
};

export const emptyView: RunView = {
  lastSeq: 0,
  status: null,
  plan: [],
  lanes: [],
  activity: [],
  sourceCount: 0,
  startedAt: null,
  endedAt: null,
  error: null,
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

function updateLane(lanes: Lane[], index: number, change: (lane: Lane) => Lane): Lane[] {
  const next = [...lanes];
  for (let i = next.length; i <= index; i++) {
    next[i] = { index: i, phase: "waiting", queries: [], pagesRead: 0, sources: [] };
  }
  next[index] = change(next[index]);
  return next;
}

function describe(event: RunEvent, plan: PlanEntry[]): string | null {
  const p = event.payload;
  switch (event.type) {
    case "plan_ready":
      return `Drafted a plan with ${plan.length} angles`;
    case "tool_call":
      return p.tool === "search" ? `Searched "${str(p.query)}"` : `Read ${hostOf(str(p.url))}`;
    case "source_found":
      return `Found a source: ${str(p.title)} (${str(p.domain)})`;
    case "node_start":
      if (p.node === "writer") return "Started writing the report";
      return null;
    case "run_completed":
      return "Report is ready";
    case "run_failed":
      return "The run failed";
    default:
      return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Fold one event into the view. Events at or below `lastSeq` are ignored, so replays are safe. */
export function applyEvent(view: RunView, event: RunEvent): RunView {
  if (event.seq <= view.lastSeq) return view;
  const p = event.payload;
  const next: RunView = {
    ...view,
    lastSeq: event.seq,
    startedAt: view.startedAt ?? event.created_at,
  };

  switch (event.type) {
    case "status":
      next.status = str(p.status) as RunStatus;
      break;
    case "plan_ready":
      next.plan = Array.isArray(p.items)
        ? (p.items as { text: string; reason?: string | null }[]).map((i) => ({
            text: i.text,
            reason: i.reason ?? null,
          }))
        : [];
      next.lanes = [];
      break;
    case "tool_call": {
      const index = num(p.index);
      if (index !== null) {
        next.lanes = updateLane(view.lanes, index, (lane) =>
          p.tool === "search"
            ? { ...lane, phase: "searching", queries: [...lane.queries, str(p.query)] }
            : { ...lane, phase: "reading" },
        );
      }
      break;
    }
    case "source_found": {
      const index = num(p.index);
      next.sourceCount = view.sourceCount + 1;
      if (index !== null) {
        const source: LaneSource = {
          url: str(p.url),
          title: str(p.title),
          domain: str(p.domain),
          quote: typeof p.quote === "string" ? p.quote : null,
        };
        next.lanes = updateLane(view.lanes, index, (lane) => ({
          ...lane,
          pagesRead: lane.pagesRead + 1,
          sources: [...lane.sources, source],
        }));
      }
      break;
    }
    case "node_end": {
      const index = num(p.index);
      if (p.node === "research" && index !== null) {
        next.lanes = updateLane(view.lanes, index, (lane) => ({ ...lane, phase: "done" }));
      }
      break;
    }
    case "run_completed":
      next.endedAt = event.created_at;
      break;
    case "run_failed":
      next.endedAt = event.created_at;
      next.error = typeof p.error === "string" ? p.error : "The run failed.";
      break;
  }

  const text = describe(event, next.plan);
  if (text) next.activity = [...view.activity, { seq: event.seq, at: event.created_at, text }];
  return next;
}

export function reduceEvents(events: RunEvent[]): RunView {
  return events.reduce(applyEvent, emptyView);
}

export type StageId = "brief" | "plan" | "research" | "writing" | "report";
export type StageState = "done" | "current" | "needs_action" | "upcoming" | "failed";
export type Stage = { id: StageId; label: string; state: StageState; line: string };

/** Names the five stages from the rail in the design plan and their one-line status. */
export function deriveStages(view: RunView): Stage[] {
  const status = view.status ?? "pending";
  const order: Record<RunStatus, number> = {
    pending: 1,
    planning: 1,
    awaiting_approval: 2,
    researching: 3,
    writing: 4,
    completed: 5,
    failed: -1,
    cancelled: -1,
  };
  const failed = status === "failed" || status === "cancelled";
  // On failure, mark the stage the run had reached as failed.
  const reached = failed
    ? view.lanes.length > 0
      ? view.activity.some((a) => a.text.startsWith("Started writing"))
        ? 4
        : 3
      : view.plan.length > 0
        ? 2
        : 1
    : order[status];
  const lanesDone = view.lanes.filter((l) => l.phase === "done").length;
  const total = view.plan.length || view.lanes.length;

  const lines: Record<StageId, string> = {
    brief: "Question received",
    plan:
      status === "planning" || status === "pending"
        ? "Drafting the plan"
        : status === "awaiting_approval"
          ? "Waiting for you"
          : `${view.plan.length} angles approved`,
    research:
      status === "researching"
        ? `${lanesDone} of ${total} angles done`
        : reached > 3
          ? `${view.sourceCount} sources read`
          : "Not started",
    writing:
      status === "writing" ? "Writing the report" : reached > 4 ? "Draft written" : "Not started",
    report: status === "completed" ? "Ready to read" : "Not started",
  };
  const ids: [StageId, string][] = [
    ["brief", "Brief"],
    ["plan", "Plan"],
    ["research", "Research"],
    ["writing", "Writing"],
    ["report", "Report"],
  ];
  return ids.map(([id, label], i) => {
    const position = i + 1;
    let state: StageState = "upcoming";
    if (status === "completed" || position < reached) state = "done";
    else if (position === reached) {
      state = failed ? "failed" : status === "awaiting_approval" ? "needs_action" : "current";
    }
    return { id, label, state, line: state === "failed" ? "Stopped" : lines[id] };
  });
}
