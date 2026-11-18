"use client";

import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Loader2, UserRound, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useApi, type Run, type RunStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const IN_PROGRESS = new Set<RunStatus>(["pending", "planning", "researching", "writing"]);

const STATUS_ICON: Partial<
  Record<RunStatus, { icon: typeof Loader2; label: string; cls: string }>
> = {
  pending: {
    icon: Loader2,
    label: "Queued",
    cls: "text-muted-foreground motion-safe:animate-spin",
  },
  planning: {
    icon: Loader2,
    label: "Planning",
    cls: "text-muted-foreground motion-safe:animate-spin",
  },
  researching: {
    icon: Loader2,
    label: "Researching",
    cls: "text-muted-foreground motion-safe:animate-spin",
  },
  writing: {
    icon: Loader2,
    label: "Writing",
    cls: "text-muted-foreground motion-safe:animate-spin",
  },
  awaiting_approval: { icon: UserRound, label: "Needs review", cls: "text-warning" },
  failed: { icon: XCircle, label: "Failed", cls: "text-destructive" },
  cancelled: { icon: Ban, label: "Cancelled", cls: "text-muted-foreground" },
  completed: { icon: CheckCircle2, label: "Done", cls: "text-success" },
};

function groupLabel(iso: string, now = new Date()): string {
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  return "Older";
}

/** Past research, newest first and grouped by day, like a chat history list. */
export function SidebarHistory({ onNavigate }: { onNavigate?: () => void }) {
  const api = useApi();
  const pathname = usePathname();
  const { data, isPending, isError } = useQuery({
    queryKey: ["runs", "sidebar"],
    queryFn: () => api.listRuns(null, {}),
    refetchInterval: (query) =>
      query.state.data?.items.some((run) => IN_PROGRESS.has(run.status)) ? 5000 : false,
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 px-2" aria-label="Loading history">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <p className="px-3 text-sm text-muted-foreground">Could not load your history.</p>;
  }
  const runs = data.items;
  if (runs.length === 0) {
    return <p className="px-3 text-sm text-muted-foreground">Your research will show up here.</p>;
  }

  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const label = groupLabel(run.created_at);
    groups.set(label, [...(groups.get(label) ?? []), run]);
  }

  return (
    <nav aria-label="History" className="flex flex-col gap-4">
      {[...groups].map(([label, items]) => (
        <section key={label} aria-label={label}>
          <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{label}</h2>
          <ul className="flex flex-col gap-0.5">
            {items.map((run) => {
              const active = pathname === `/runs/${run.id}`;
              const mark = STATUS_ICON[run.status];
              const showMark = mark && run.status !== "completed";
              return (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={run.question}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150 sm:min-h-9",
                      "hover:bg-accent",
                      active && "bg-accent font-medium",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{run.question}</span>
                    {showMark && (
                      <>
                        <mark.icon aria-hidden="true" className={cn("size-4 shrink-0", mark.cls)} />
                        <span className="sr-only">{mark.label}</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
