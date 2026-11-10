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

/** Five named stages with a status line each; the current stage is the only accent. */
export function ProgressRail({
  view,
  now,
  footer,
}: {
  view: RunView;
  now: number;
  /** Actions under the stages, such as Cancel run. */
  footer?: React.ReactNode;
}) {
  const stages = deriveStages(view);
  return (
    <nav aria-label="Progress" className="min-w-0">
      <ol className="relative flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {stages.map((stage) => {
          const { icon: Icon, className, label } = MARK[stage.state];
          const current = stage.state === "current" || stage.state === "needs_action";
          return (
            <li
              key={stage.id}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex min-w-[7.5rem] items-start gap-3 rounded-md px-3 py-2 lg:min-w-0",
                current && "bg-muted",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  className,
                )}
              >
                <Icon aria-hidden="true" className="size-3" />
                <span className="sr-only">{label}</span>
              </span>
              <span className="flex flex-col">
                <span
                  className={cn(
                    "text-sm font-semibold",
                    stage.state === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {stage.label}
                </span>
                <span
                  className={cn(
                    "text-xs text-muted-foreground",
                    stage.state === "needs_action" && "font-medium text-warning",
                  )}
                >
                  {stage.state === "needs_action" ? `Your turn · ${stage.line}` : stage.line}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <dl className="mt-4 hidden gap-1 border-t border-border px-3 pt-4 text-sm lg:grid">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Elapsed</dt>
          <dd className="font-mono text-[13px]">{elapsed(view, now)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Sources found</dt>
          <dd className="font-mono text-[13px]">{view.sourceCount}</dd>
        </div>
      </dl>
      {footer && <div className="mt-4 px-3">{footer}</div>}
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
