"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ExampleChips } from "@/components/research/example-chips";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, useApi, type Depth } from "@/lib/api";

export const MIN_QUESTION_LENGTH = 10;
export const MAX_QUESTION_LENGTH = 1000;

const DEPTHS: { value: Depth; label: string; hint: string }[] = [
  { value: "quick", label: "Quick", hint: "about 3 angles, ~1 min" },
  { value: "deep", label: "Deep", hint: "about 6 angles, ~3 min" },
];

export function BriefComposer({
  question,
  onQuestionChange,
}: {
  question: string;
  onQuestionChange: (value: string) => void;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [depth, setDepth] = useState<Depth>("quick");
  const textareaId = useId();
  const hintId = useId();

  const trimmed = question.trim();
  const canSubmit = trimmed.length >= MIN_QUESTION_LENGTH && trimmed.length <= MAX_QUESTION_LENGTH;

  const createRun = useMutation({
    mutationFn: () => api.createRun({ question: trimmed, depth }),
    onSuccess: () => {
      onQuestionChange("");
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "Could not create the run. Please try again.",
      );
    },
  });

  function submit() {
    if (canSubmit && !createRun.isPending) createRun.mutate();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={textareaId} className="text-base font-semibold">
          What do you want to find out?
        </label>
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
          className="max-h-52 min-h-[5.5rem] resize-none bg-card"
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {trimmed.length < MIN_QUESTION_LENGTH
            ? `Write at least ${MIN_QUESTION_LENGTH} characters.`
            : "Press Ctrl or Cmd + Enter to draft a plan."}
        </p>
      </div>

      <ExampleChips onPick={onQuestionChange} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          aria-label="Research depth"
          value={[depth]}
          onValueChange={(values) => {
            if (values[0]) setDepth(values[0] as Depth);
          }}
          variant="outline"
          className="flex-col items-stretch sm:flex-row"
        >
          {DEPTHS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              className="h-auto min-h-11 flex-col items-start gap-0 px-3 py-1.5 aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary sm:items-center"
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit || createRun.isPending}
          className="min-h-11 sm:min-h-9"
        >
          {createRun.isPending ? "Drafting…" : "Draft a plan"}
        </Button>
      </div>
    </form>
  );
}
