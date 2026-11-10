"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ActivityPanel, type PanelTab } from "@/components/research/activity-panel";
import { ProgressRail, StreamNotice } from "@/components/research/progress-rail";
import { ResearchFloor } from "@/components/research/research-floor";
import { SourceCard, type PanelSource } from "@/components/research/source-card";
import { StatusBadge } from "@/components/research/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRunStream } from "@/hooks/use-run-stream";
import { ApiError, useApi, type PlanAction, type RunStatus } from "@/lib/api";
import type { PlanEntry } from "@/lib/run-events";
import { formatRelative } from "@/lib/utils";

// dnd-kit only loads when a plan is actually waiting for review.
const PlanBoard = dynamic(
  () => import("@/components/research/plan-board").then((m) => m.PlanBoard),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-lg" /> },
);

// react-markdown and remark-gfm only load once there is a report to read.
const ReportView = dynamic(
  () => import("@/components/research/report-view").then((m) => m.ReportView),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full rounded-lg" /> },
);

type Optimistic = { status: RunStatus; plan?: PlanEntry[]; atSeq: number };

export function RunWorkspace({ runId }: { runId: string }) {
  const api = useApi();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
  const { view, connection } = useRunStream(runId);
  const [tab, setTab] = useState<PanelTab>("sources");
  const [hoverNum, setHoverNum] = useState<number | null>(null);
  const [clickedNum, setClickedNum] = useState<number | null>(null);
  const [sheetNum, setSheetNum] = useState<number | null>(null);
  const panelBesideReport = useMediaQuery("(min-width: 1280px)");
  // Stable on purpose: the report re-renders its citations whenever this changes.
  const openSource = useCallback(
    (num: number) => {
      setClickedNum(num);
      if (panelBesideReport) {
        setTab("sources");
        // Wait for the Sources tab to render before scrolling to the card.
        requestAnimationFrame(() =>
          document
            .getElementById(`source-${num}`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" }),
        );
      } else {
        setSheetNum(num);
      }
    },
    [panelBesideReport],
  );
  const [now, setNow] = useState(() => Date.now());
  // What we show before the server confirms a decision; rolled back if the request fails.
  const [guess, setOptimistic] = useState<Optimistic | null>(null);
  // Any new stream event means the server has answered, so the guess no longer applies.
  const optimistic = guess && guess.atSeq === view.lastSeq ? guess : null;
  const serverStatus = view.status ?? data?.status ?? "pending";
  const status = optimistic?.status ?? serverStatus;
  const decide = useMutation({
    mutationFn: (body: PlanAction) => api.submitPlan(runId, body),
    onMutate: (body) =>
      setOptimistic(
        body.action === "approve"
          ? {
              status: "researching",
              atSeq: view.lastSeq,
              plan: body.items?.map((i) => ({ text: i.text, reason: i.reason ?? null })),
            }
          : { status: "planning", atSeq: view.lastSeq },
      ),
    onError: (err) => {
      setOptimistic(null);
      toast.error(err instanceof ApiError ? err.message : "Could not send your decision.");
    },
  });

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

  const savedPlan =
    view.plan.length > 0
      ? view.plan
      : (data.plan ?? []).map((p) => ({ text: p.text, reason: p.reason ?? null }));
  const plan = optimistic?.plan ?? savedPlan;
  const panelSources: PanelSource[] =
    data.sources && data.sources.length > 0
      ? data.sources.map((src) => ({
          url: src.url,
          title: src.title,
          domain: src.domain,
          quote: src.quote ?? null,
          num: src.citation_num,
        }))
      : view.lanes.flatMap((l) => l.sources);
  const sheetSource = panelSources.find((src) => src.num === sheetNum);
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
          {serverStatus === "awaiting_approval" && (
            <div hidden={optimistic !== null}>
              <PlanBoard
                key={view.planSeq}
                question={data.question}
                plan={savedPlan}
                busy={decide.isPending}
                error={decide.error instanceof ApiError ? decide.error.message : null}
                onApprove={(items) => decide.mutate({ action: "approve", items })}
                onReplan={(feedback) => decide.mutate({ action: "replan", feedback })}
              />
            </div>
          )}
          {status === "planning" && (
            <div role="status" className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-semibold">Drafting the plan</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The planner is breaking your question into angles.
              </p>
              <Skeleton className="mt-3 h-16 w-full rounded-lg" />
            </div>
          )}
          {(view.lanes.length > 0 || status === "researching" || status === "writing") &&
            status !== "completed" && <ResearchFloor plan={plan} lanes={view.lanes} />}
          {status === "writing" && (
            <div role="status" className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-semibold">Writing the report</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The sources are collected. The report appears here as soon as it is written.
              </p>
            </div>
          )}
          {status === "completed" && !data.report && (
            <Skeleton className="h-96 w-full rounded-lg" />
          )}
          {status === "completed" && data.report && (
            <ReportView
              runId={runId}
              question={data.question}
              depth={data.depth}
              date={data.completed_at ?? data.created_at}
              report={data.report}
              sources={data.sources ?? []}
              onHighlight={setHoverNum}
              onOpen={openSource}
            />
          )}
          {status === "completed" && view.lanes.length > 0 && (
            <details className="group rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
                Research details ({view.lanes.length} angles, {data.source_count} sources)
              </summary>
              <div className="mt-4">
                <ResearchFloor plan={plan} lanes={view.lanes} />
              </div>
            </details>
          )}
        </div>

        <aside className="min-w-0 lg:col-span-2 xl:col-span-1">
          <ActivityPanel
            activity={view.activity}
            sources={panelSources}
            activeNum={hoverNum ?? clickedNum}
            tab={tab}
            onTabChange={setTab}
          />
        </aside>
      </div>
      <Sheet open={sheetSource !== undefined} onOpenChange={(open) => !open && setSheetNum(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Source {sheetSource?.num}</SheetTitle>
            <SheetDescription>Where this claim in the report comes from.</SheetDescription>
          </SheetHeader>
          {sheetSource && <SourceCard source={sheetSource} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
