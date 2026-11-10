const STAGES = ["Brief", "Plan", "Research", "Writing", "Report"];
const LANES = [
  { title: "How mature is the technology?", chips: 2, done: true },
  { title: "What do recent studies say?", chips: 2, done: false },
  { title: "Where are the open problems?", chips: 1, done: false },
];

/** A static picture of the run workspace: the rail, three research lanes and a report page.
 * Decorative only, built from the design tokens (no images, no stock robots). */
export function WorkspaceIllustration() {
  return (
    <div
      aria-hidden="true"
      className="grid w-full grid-cols-1 gap-3 rounded-xl border border-border bg-muted p-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,0.8fr)] sm:p-4"
    >
      <ol className="hidden flex-col gap-3 sm:flex">
        {STAGES.map((stage, i) => (
          <li key={stage} className="flex items-center gap-2 text-xs">
            <span
              className={`flex size-4 items-center justify-center rounded-full border text-[9px] ${
                i < 2
                  ? "border-success bg-success text-primary-foreground"
                  : i === 2
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              {i < 2 ? "✓" : ""}
            </span>
            <span className={i === 2 ? "font-semibold" : "text-muted-foreground"}>{stage}</span>
          </li>
        ))}
      </ol>

      <div className="flex min-w-0 flex-col gap-2">
        {LANES.map((lane) => (
          <div key={lane.title} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{lane.title}</span>
              <span className="text-[10px] text-muted-foreground">
                {lane.done ? "Done" : "Reading"}
              </span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-primary"
                style={{ width: lane.done ? "100%" : "55%" }}
              />
            </div>
            <div className="mt-2 flex gap-2">
              {Array.from({ length: lane.chips }, (_, i) => (
                <span
                  key={i}
                  className="flex-1 truncate rounded-md border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground"
                >
                  nature.com · battery recycling
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden rounded-lg border border-border bg-card p-4 sm:block">
        <div className="h-2.5 w-4/5 rounded bg-foreground/80" />
        <div className="mt-3 flex flex-col gap-1.5">
          {[100, 92, 96, 70].map((w, i) => (
            <div
              key={i}
              className="h-1.5 rounded bg-muted-foreground/40"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
        <div className="mt-4 h-2 w-1/3 rounded bg-foreground/60" />
        <div className="mt-2 flex flex-col gap-1.5">
          {[100, 88, 60].map((w, i) => (
            <div
              key={i}
              className="h-1.5 rounded bg-muted-foreground/40"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
        <span className="mt-3 inline-block font-mono text-[10px] text-primary">[1] [2] [3]</span>
      </div>
    </div>
  );
}
