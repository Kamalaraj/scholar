"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ExampleChips } from "@/components/research/example-chips";
import { StatusBadge } from "@/components/research/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi, type Run } from "@/lib/api";
import { formatRelative } from "@/lib/utils";

function RunRow({ run }: { run: Run }) {
  return (
    <li>
      <Link
        href={`/runs/${run.id}`}
        className="flex min-h-11 flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <span className="line-clamp-2 text-base font-medium">{run.question}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <StatusBadge status={run.status} />
          <span>{run.depth === "deep" ? "Deep" : "Quick"}</span>
          <span>
            {run.source_count} {run.source_count === 1 ? "source" : "sources"}
          </span>
          <time dateTime={run.created_at}>{formatRelative(run.created_at)}</time>
        </span>
      </Link>
    </li>
  );
}

export function RunsLibrary({ onPickExample }: { onPickExample: (question: string) => void }) {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: ["runs"],
    queryFn: ({ pageParam }) => api.listRuns(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });

  const runs = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="library-heading" className="flex flex-col gap-4">
      <h2 id="library-heading" className="text-xl font-semibold">
        Your reports
      </h2>

      {query.isPending && (
        <ul aria-label="Loading reports" className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-[92px] w-full rounded-lg" />
            </li>
          ))}
        </ul>
      )}

      {query.isError && (
        <div role="alert" className="rounded-lg border border-border bg-card p-4">
          <p className="font-medium">We could not load your reports.</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button
            variant="outline"
            className="mt-3 min-h-11 sm:min-h-8"
            onClick={() => query.refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {query.isSuccess && runs.length === 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
          <p className="text-muted-foreground">
            No reports yet. Write a brief above, or start from an example.
          </p>
          <ExampleChips onPick={onPickExample} />
        </div>
      )}

      {runs.length > 0 && (
        <ul className="flex flex-col gap-3">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <Button
          variant="outline"
          className="min-h-11 self-center sm:min-h-8"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  );
}
