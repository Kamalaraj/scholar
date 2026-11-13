"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ExampleChips } from "@/components/research/example-chips";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, useApi, type Depth } from "@/lib/api";
import { markAutoApprove } from "@/lib/auto-approve";
import { friendlyError } from "@/lib/rate-limit";

export const MIN_QUESTION_LENGTH = 10;
export const MAX_QUESTION_LENGTH = 1000;

const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: "quick", label: "Quick", hint: "about 3 angles, ~1 min" },
  { value: "deep", label: "Deep", hint: "about 6 angles, ~3 min" },
];

/** The home screen: one big input, depth, and a send button. Submitting opens the run. */
export function BriefComposer({
  question,
  onQuestionChange,
}: {
  question: string;
  onQuestionChange: (value: string) => void;
}) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [depth, setDepth] = useState<Depth>("quick");
  const [reviewPlan, setReviewPlan] = useState(true);
  const textareaId = useId();
  const reviewId = useId();
  const hintId = useId();

  const trimmed = question.trim();
  const canSubmit = trimmed.length >= MIN_QUESTION_LENGTH && trimmed.length <= MAX_QUESTION_LENGTH;

  const createRun = useMutation({
    mutationFn: () => api.createRun({ question: trimmed, depth }),
    onSuccess: (run) => {
      if (!reviewPlan) markAutoApprove(run.id);
      onQuestionChange("");
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
      router.push(`/runs/${run.id}`);
    },
    onError: (error) => {
      toast.error(friendlyError(error, "Could not create the run. Please try again."));
    },
  });

  function submit() {
    if (canSubmit && !createRun.isPending) createRun.mutate();
  }

  return (
    <form
      id="brief"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-3 text-center">
        <label htmlFor={textareaId} className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What do you want to find out?
        </label>
        <p className="text-muted-foreground">
          Ask a question. Scholar searches the web and writes a cited report.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card p-3 shadow-sm focus-within:border-input">
        <Textarea
          id={textareaId}
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          rows={3}
          maxLength={MAX_QUESTION_LENGTH}
          placeholder="e.g. What are the main approaches to recycling EV batteries?"
          aria-describedby={hintId}
          className="max-h-52 min-h-[4.5rem] resize-none border-0 bg-transparent px-2 py-1 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            aria-label="Research depth"
            value={[depth]}
            onValueChange={(values) => {
              if (values[0]) setDepth(values[0] as Depth);
            }}
            variant="outline"
            className="rounded-full"
          >
            {DEPTHS.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                title={option.hint}
                className="min-h-11 rounded-full px-4 aria-pressed:bg-accent sm:min-h-8"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="submit"
            size="icon"
            aria-label="Draft a plan"
            disabled={!canSubmit || createRun.isPending}
            className="size-11 rounded-full sm:size-9"
          >
            {createRun.isPending ? (
              <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <ArrowUp aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
        <p id={hintId}>
          {trimmed.length < MIN_QUESTION_LENGTH
            ? `Write at least ${MIN_QUESTION_LENGTH} characters.`
            : "Press Ctrl or Cmd + Enter to send."}
        </p>
        <label htmlFor={reviewId} className="flex min-h-11 items-center gap-2 sm:min-h-8">
          <input
            id={reviewId}
            type="checkbox"
            checked={reviewPlan}
            onChange={(event) => setReviewPlan(event.target.checked)}
            className="size-4 accent-primary"
          />
          Review the plan before research starts
        </label>
      </div>

      <ExampleChips onPick={onQuestionChange} />

      {createRun.error instanceof ApiError && createRun.error.status === 429 && (
        <p role="alert" className="rounded-2xl border border-warning bg-card p-3 text-sm">
          {friendlyError(createRun.error, "You have reached today's limit.")}
        </p>
      )}
    </form>
  );
}
