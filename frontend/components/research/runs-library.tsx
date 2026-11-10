"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ExampleChips } from "@/components/research/example-chips";
import { StatusBadge } from "@/components/research/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi, type Run } from "@/lib/api";
import {
  STATUS_FILTERS,
  hasActiveFilters,
  type RunFilters,
  type StatusFilter,
} from "@/lib/library-filters";
import { friendlyError } from "@/lib/rate-limit";
import { formatRelative } from "@/lib/utils";

// A run the background worker is busy with cannot be deleted; cancel it first.
const DELETABLE = new Set(["pending", "awaiting_approval", "completed", "failed", "cancelled"]);

function RunRow({ run, onDelete }: { run: Run; onDelete: (run: Run) => void }) {
  return (
    <li className="relative">
      <Link
        href={`/runs/${run.id}`}
        className="flex min-h-11 flex-col gap-2 rounded-lg border border-border bg-card p-4 pr-16 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
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
      {DELETABLE.has(run.status) && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete report: ${run.question}`}
          className="absolute top-2 right-2 min-h-11 min-w-11 text-muted-foreground hover:text-destructive sm:min-h-8 sm:min-w-8"
          onClick={() => onDelete(run)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      )}
    </li>
  );
}

export function RunsLibrary({ onPickExample }: { onPickExample: (question: string) => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [toDelete, setToDelete] = useState<Run | null>(null);
  const filters: RunFilters = { q: useDebouncedValue(search.trim()), status };
  const filtered = hasActiveFilters(filters);

  const query = useInfiniteQuery({
    queryKey: ["runs", filters.q, filters.status],
    queryFn: ({ pageParam }) => api.listRuns(pageParam, filters),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    placeholderData: (previous) => previous,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRun(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      toast.success("Report deleted");
    },
    onError: (error) => toast.error(friendlyError(error, "Could not delete the report.")),
  });

  const runs = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="library-heading" className="flex flex-col gap-4">
      <h2 id="library-heading" className="text-xl font-semibold">
        Your reports
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label htmlFor={searchId} className="sr-only">
            Search your reports
          </label>
          <Input
            id={searchId}
            type="search"
            value={search}
            maxLength={200}
            placeholder="Search your reports"
            className="min-h-11 bg-card pl-9 sm:min-h-8"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as StatusFilter)}
          items={STATUS_FILTERS}
        >
          <SelectTrigger
            aria-label="Filter by status"
            className="min-h-11 w-full bg-card sm:min-h-8 sm:w-52"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      {query.isSuccess && runs.length === 0 && !filtered && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-6">
          <p className="text-muted-foreground">
            No reports yet. Write a brief above, or start from an example.
          </p>
          <ExampleChips onPick={onPickExample} />
        </div>
      )}

      {query.isSuccess && runs.length === 0 && filtered && (
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-6"
        >
          <p className="text-muted-foreground">No reports match your search.</p>
          <Button
            variant="outline"
            className="min-h-11 sm:min-h-8"
            onClick={() => {
              setSearch("");
              setStatus("all");
            }}
          >
            Clear search and filter
          </Button>
        </div>
      )}

      {runs.length > 0 && (
        <ul aria-label="Reports" className="flex flex-col gap-3">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} onDelete={setToDelete} />
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

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.question} This removes the report and its sources for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (toDelete) remove.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
