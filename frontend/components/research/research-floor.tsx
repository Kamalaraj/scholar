import { Ban, CheckCircle2, Globe, Loader2, Search } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { Lane, LanePhase, PlanEntry } from "@/lib/run-events";

const PHASE_LABEL: Record<LanePhase, string> = {
  waiting: "Waiting",
  searching: "Searching the web",
  reading: "Reading sources",
  done: "Done",
};

function LaneCard({
  lane,
  question,
  pages,
  stopped,
}: {
  lane: Lane;
  question: string;
  pages: number;
  stopped: boolean;
}) {
  const done = lane.phase === "done";
  // A lane that never finished on a cancelled or failed run is stopped, not still working.
  const halted = stopped && !done;
  const busy = !done && !halted && lane.phase !== "waiting";
  const Icon = done ? CheckCircle2 : halted ? Ban : lane.phase === "waiting" ? Search : Loader2;
  return (
    <li className="rounded-lg border border-border bg-muted p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold">{question}</h3>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Icon
            aria-hidden="true"
            className={`size-3.5 ${busy ? "motion-safe:animate-spin" : ""} ${done ? "text-success" : ""}`}
          />
          {halted ? "Stopped" : PHASE_LABEL[lane.phase]}
        </span>
      </div>
      <Progress
        value={done ? 100 : Math.min(95, lane.pagesRead * (100 / Math.max(pages, 1)))}
        aria-label={`Progress for: ${question}`}
        className="mt-3 h-1"
      />
      {lane.queries.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {lane.queries.map((q) => (
            <li
              key={q}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-[13px]"
            >
              Searching: {q}
            </li>
          ))}
        </ul>
      )}
      {lane.sources.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {lane.sources.map((s) => (
            <li
              key={s.url}
              className="animate-source-arrive rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Globe aria-hidden="true" className="size-3.5" />
                <span className="truncate font-mono">{s.domain}</span>
              </div>
              <p className="mt-1 text-sm font-medium">{s.title}</p>
              {s.quote && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">“{s.quote}”</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** One lane per sub-question; source cards land in the lane as they are found. */
export function ResearchFloor({
  plan,
  lanes,
  stopped = false,
}: {
  plan: PlanEntry[];
  lanes: Lane[];
  /** The run was cancelled or failed: unfinished lanes show Stopped instead of spinning. */
  stopped?: boolean;
}) {
  const pages = plan.length > 0 ? Math.max(2, ...lanes.map((l) => l.pagesRead)) : 2;
  return (
    <section aria-labelledby="floor-heading" className="flex flex-col gap-3">
      <h2 id="floor-heading" className="text-xl font-semibold">
        Research floor
      </h2>
      <ul className="flex flex-col gap-3">
        {plan.map((entry, i) => (
          <LaneCard
            key={i}
            lane={
              lanes[i] ?? { index: i, phase: "waiting", queries: [], pagesRead: 0, sources: [] }
            }
            question={entry.text}
            pages={pages}
            stopped={stopped}
          />
        ))}
      </ul>
    </section>
  );
}
