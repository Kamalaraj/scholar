"use client";

import { useQuery } from "@tanstack/react-query";

import { StatusBadge } from "@/components/research/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, useApi } from "@/lib/api";
import { formatRelative } from "@/lib/utils";

/** Placeholder for the run workspace until the progress rail and stages land in Phase 4. */
export function RunSummary({ runId }: { runId: string }) {
  const api = useApi();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });

  if (isPending) return <Skeleton className="h-32 w-full rounded-lg" />;

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

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
      <StatusBadge status={data.status} />
      <h1 className="text-2xl font-semibold">{data.question}</h1>
      <p className="text-sm text-muted-foreground">
        {data.depth === "deep" ? "Deep" : "Quick"} · started {formatRelative(data.created_at)}
      </p>
    </article>
  );
}
