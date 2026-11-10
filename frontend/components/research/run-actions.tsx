"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { friendlyError } from "@/lib/rate-limit";
import { formatRelative } from "@/lib/utils";

/** Ghost destructive button; stopping a run asks first because research cannot be un-spent. */
export function CancelRunButton({ runId }: { runId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.cancelRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["run", runId] });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      toast.success("Run cancelled");
    },
    onError: (error) => toast.error(friendlyError(error, "Could not cancel the run.")),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            className="min-h-11 w-full justify-start text-destructive hover:text-destructive sm:min-h-8"
          />
        }
      >
        Cancel run
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
          <AlertDialogDescription>
            Research stops now and nothing more is searched or written. You can start again from the
            same plan afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate();
              setOpen(false);
            }}
          >
            Cancel run
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const ERROR_ID = /\s*\(error id ([a-z0-9]+)\)\s*$/i;

/** Plain-words card for a failed or cancelled run, with a way to start again from the same plan. */
export function RunStopped({
  runId,
  kind,
  message,
  at,
}: {
  runId: string;
  kind: "failed" | "cancelled";
  message: string | null;
  at: string | null;
}) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.retryRun(runId),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      router.push(`/runs/${run.id}`);
    },
    onError: (error) => toast.error(friendlyError(error, "Could not start the run again.")),
  });

  const errorId = message?.match(ERROR_ID)?.[1];
  const text = message?.replace(ERROR_ID, "") ?? "";
  const cancelled = kind === "cancelled";

  return (
    <div
      role="alert"
      className={
        cancelled
          ? "rounded-lg border border-border bg-muted p-4"
          : "rounded-lg border border-destructive bg-card p-4"
      }
    >
      <h2 className={cancelled ? "font-semibold" : "font-semibold text-destructive"}>
        {cancelled ? "This run was cancelled" : "This run stopped"}
      </h2>
      <p className="mt-1 text-sm">
        {cancelled
          ? `Cancelled ${at ? formatRelative(at) : "earlier"}. Nothing more was researched.`
          : text || "Something went wrong while researching."}
      </p>
      {!cancelled && errorId && (
        <details className="mt-2 text-sm text-muted-foreground">
          <summary className="cursor-pointer">Details</summary>
          <p className="mt-1 font-mono text-[13px]">{errorId ? `Error id: ${errorId}` : message}</p>
        </details>
      )}
      <Button
        className="mt-3 min-h-11 sm:min-h-8"
        disabled={retry.isPending}
        onClick={() => retry.mutate()}
      >
        <RotateCcw aria-hidden="true" />
        {cancelled ? "Start again with this plan" : "Retry"}
      </Button>
    </div>
  );
}
