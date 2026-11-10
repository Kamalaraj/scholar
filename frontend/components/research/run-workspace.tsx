"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ActivityPanel } from "@/components/research/activity-panel";
import { ProgressRail, StreamNotice } from "@/components/research/progress-rail";
import { ResearchFloor } from "@/components/research/research-floor";
import { StatusBadge } from "@/components/research/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunStream } from "@/hooks/use-run-stream";
import { ApiError, useApi } from "@/lib/api";
import { formatRelative } from "@/lib/utils";

export function RunWorkspace({ runId }: { runId: string }) {
  const api = useApi();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  const { view, connection } = useRunStream(runId);
  const [now, setNow] = useState(() => Date.now());
  const status = view.status ?? data?.status ?? "pending";
  const live = status !== "completed" && status !== "failed" && status !== "cancelled";

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Fetch the saved report once the stream says the run is over.
  useEffect(() => {
    if (view.status === "completed" || view.status === "failed") void refetch();
  }, [view.status, refetch]);

  if (isPending) return <Skeleton className="h-64 w-full rounded-lg" />;

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Report not found</h1>
        <p className="mt-2 text-muted-foreground">
          This report does not exist, or it belongs to another account.
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">We could not load this report</h1>
        <button className="mt-3 underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const plan =
    view.plan.length > 0
      ? view.plan
      : (data.plan ?? []).map((p) => ({ text: p.text, reason: p.reason ?? null }));
  const sources = view.lanes.flatMap((l) => l.sources);
  const failure = view.error ?? data.error;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <StatusBadge status={status} />
        <h1 className="text-2xl font-semibold">{data.question}</h1>
        <p className="text-sm text-muted-foreground">
          {data.depth === "deep" ? "Deep" : "Quick"} · started {formatRelative(data.created_at)}
        </p>
      </header>

      {/* Announces stage changes only, never individual events. */}
      <p aria-live="polite" className="sr-only">
        {status.replace("_", " ")}
      </p>

      {connection === "reconnecting" && <StreamNotice>Reconnecting…</StreamNotice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <ProgressRail view={{ ...view, status }} now={now} />

        <div className="flex min-w-0 flex-col gap-6">
          {failure && (
            <div role="alert" className="rounded-lg border border-destructive bg-card p-4">
              <h2 className="font-semibold text-destructive">This run stopped</h2>
              <p className="mt-1 text-sm">{failure}</p>
            </div>
          )}
          {status === "awaiting_approval" && (
            <div className="rounded-lg border border-warning bg-card p-4">
              <h2 className="font-semibold">Here is the plan</h2>
              <ol className="mt-2 list-decimal pl-5 text-sm">
                {plan.map((p, i) => (
                  <li key={i}>{p.text}</li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-muted-foreground">
                Editing and approving the plan arrives in the next phase.
              </p>
            </div>
          )}
          {(view.lanes.length > 0 ||
            status === "researching" ||
            status === "writing" ||
            status === "completed") && <ResearchFloor plan={plan} lanes={view.lanes} />}
          {status === "completed" && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-semibold">The report is ready</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.source_count} sources collected. The reading view arrives in Phase 6.
              </p>
            </div>
          )}
        </div>

        <aside className="min-w-0 lg:col-span-2 xl:col-span-1">
          <ActivityPanel activity={view.activity} sources={sources} />
        </aside>
      </div>
    </div>
  );
}
