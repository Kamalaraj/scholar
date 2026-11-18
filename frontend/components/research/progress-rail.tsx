import { AlertCircle, Ban, Check, Circle, Loader2, UserRound, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { deriveStages, type RunView, type StageState } from "@/lib/run-events";

const MARK: Record<StageState, { icon: typeof Circle; className: string; label: string }> = {
  done: {
    icon: Check,
    className: "border-success bg-success text-primary-foreground",
    label: "Done",
  },
  current: {
    icon: Loader2,
    className: "border-primary text-primary motion-safe:animate-spin",
    label: "In progress",
  },
  needs_action: { icon: UserRound, className: "border-warning text-warning", label: "Your turn" },
  cancelled: {
    icon: Ban,
    className: "border-muted-foreground bg-muted text-muted-foreground",
    label: "Cancelled",
  },
  failed: { icon: XCircle, className: "border-destructive text-destructive", label: "Stopped" },
  upcoming: {
    icon: Circle,
    className: "border-border text-muted-foreground",
    label: "Not started",
  },
};

function elapsed(view: RunView, now: number): string {
  if (!view.startedAt) return "0:00";
  const end = view.endedAt ? new Date(view.endedAt).getTime() : now;
  const seconds = Math.max(0, Math.round((end - new Date(view.startedAt).getTime()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Compact stepper: five named stages in a row, then the current stage's status line. */
export function ProgressRail({
  view,
  now,
  footer,
}: {
  view: RunView;
  now: number;
  /** Actions beside the status line, such as Cancel run. */
  footer?: React.ReactNode;
}) {
  const stages = deriveStages(view);
  const focus = stages.find((s) => s.state === "needs_action" || s.state === "current");
  return (
    <nav aria-label="Progress" className="flex min-w-0 flex-col gap-3">
      <ol className="flex items-center gap-1">
        {stages.map((stage, index) => {
          const { icon: Icon, className, label } = MARK[stage.state];
          const current = stage === focus;
          return (
            <li
              key={stage.id}
              aria-current={current ? "step" : undefined}
              className="flex min-w-0 flex-1 items-center gap-1"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    className,
                  )}
                >
                  <Icon aria-hidden="true" className="size-3" />
                  <span className="sr-only">{label}</span>
                </span>
                <span
                  className={cn(
                    "truncate text-xs font-medium",
                    !current && "hidden sm:inline",
                    stage.state === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
              </span>
              {index < stages.length - 1 && (
                <span aria-hidden="true" className="h-px min-w-2 flex-1 bg-border" />
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <p
          className={cn(
            "text-muted-foreground",
            focus?.state === "needs_action" && "font-medium text-warning",
          )}
        >
          {focus
            ? `${focus.state === "needs_action" ? "Your turn · " : ""}${focus.line}`
            : "\u00a0"}
          <span className="ml-3 font-mono text-[13px]">
            {elapsed(view, now)} · {view.sourceCount}{" "}
            {view.sourceCount === 1 ? "source" : "sources"}
          </span>
        </p>
        {footer}
      </div>
    </nav>
  );
}

export function StreamNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
    >
      <AlertCircle aria-hidden="true" className="size-4" />
      {children}
    </div>
  );
}
