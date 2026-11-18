"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MessageSquareText, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_ITEMS,
  MAX_LENGTH,
  approvalBlocker,
  fromPlan,
  moveItem,
  newId,
  textError,
  toPayload,
  type PlanDraftItem,
} from "@/lib/plan-items";
import type { PlanEntry } from "@/lib/run-events";
import { cn } from "@/lib/utils";

type CardProps = {
  item: PlanDraftItem;
  index: number;
  total: number;
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
};

function PlanCard({
  item,
  index,
  total,
  editing,
  disabled,
  onEdit,
  onCommit,
  onCancel,
  onDelete,
  onMove,
}: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  const [draft, setDraft] = useState(item.text);
  const error = textError(editing ? draft : item.text);
  const showError = editing ? draft.length > 0 && error : item.text.length > 0 && error;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex gap-3 rounded-lg border border-border bg-card p-4",
        isDragging && "relative z-10 border-primary",
        error && !editing && "border-destructive",
      )}
    >
      <button
        type="button"
        data-handle={item.id}
        aria-label={`Move angle ${index + 1}. Press Alt and the up or down arrow to reorder.`}
        disabled={disabled}
        className="flex min-h-11 min-w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:min-h-8 sm:min-w-8"
        {...attributes}
        {...listeners}
        onKeyDown={(e) => {
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
            e.preventDefault();
            e.stopPropagation();
            onMove(e.key === "ArrowUp" ? -1 : 1);
            return;
          }
          listeners?.onKeyDown?.(e);
        }}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[13px] text-muted-foreground">
          {index + 1} of {total}
        </p>
        {editing ? (
          <Textarea
            autoFocus
            aria-label={`Angle ${index + 1}`}
            aria-invalid={Boolean(showError)}
            value={draft}
            maxLength={MAX_LENGTH + 50}
            className="mt-1"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.setSelectionRange(draft.length, draft.length)}
            onBlur={() => (textError(draft) ? onCancel() : onCommit(draft))}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!textError(draft)) onCommit(draft);
              }
            }}
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            aria-label={`Edit angle ${index + 1}: ${item.text || "empty"}`}
            className="mt-1 block w-full rounded-md text-left text-base font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={() => {
              setDraft(item.text);
              onEdit();
            }}
          >
            {item.text || <span className="text-muted-foreground">Write an angle…</span>}
          </button>
        )}
        {showError && (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {error}
          </p>
        )}
        {item.reason && !editing && (
          <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={`Delete angle ${index + 1}`}
        className="min-h-11 min-w-11 shrink-0 sm:min-h-8 sm:min-w-8"
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </Button>
    </li>
  );
}

type Props = {
  question: string;
  plan: PlanEntry[];
  /** True while a decision is being sent; the board is read-only. */
  busy: boolean;
  error: string | null;
  onApprove: (items: { text: string; reason: string | null }[]) => void;
  onReplan: (feedback: string) => void;
};

/** The plan as editable cards: edit, reorder (drag or Alt+Arrow), delete, add, approve or re-plan. */
export function PlanBoard({ question, plan, busy, error, onApprove, onReplan }: Props) {
  const [items, setItems] = useState<PlanDraftItem[]>(() => fromPlan(plan));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null); // a just-added card that may be discarded
  const [announcement, setAnnouncement] = useState("");
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const focusHandle = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!focusHandle.current) return;
    document.querySelector<HTMLElement>(`[data-handle="${focusHandle.current}"]`)?.focus();
    focusHandle.current = null;
  });

  const blocker = approvalBlocker(items);
  const locked = busy;

  function reorder(from: number, to: number) {
    const moved = items[from];
    const next = moveItem(items, from, to);
    if (next === items) return;
    setItems(next);
    setAnnouncement(`Angle moved to position ${to + 1} of ${items.length}.`);
    if (moved) focusHandle.current = moved.id;
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    reorder(
      items.findIndex((i) => i.id === active.id),
      items.findIndex((i) => i.id === over.id),
    );
  }

  function add() {
    const id = newId();
    setItems((prev) => [...prev, { id, text: "", reason: null }]);
    setEditingId(id);
    setFresh(id);
  }

  function discardIfFresh(id: string) {
    setEditingId(null);
    if (fresh === id) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setFresh(null);
    }
  }

  return (
    <section aria-labelledby="plan-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="plan-heading" className="text-xl font-semibold">
          Here is the plan. Edit anything before research starts.
        </h2>
        <p className="mt-2 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          {question}
        </p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol aria-label="Research angles" className="flex flex-col gap-3">
            {items.map((item, index) => (
              <PlanCard
                key={item.id}
                item={item}
                index={index}
                total={items.length}
                editing={editingId === item.id}
                disabled={locked}
                onEdit={() => setEditingId(item.id)}
                onCommit={(text) => {
                  setItems((prev) =>
                    prev.map((i) => (i.id === item.id ? { ...i, text: text.trim() } : i)),
                  );
                  setEditingId(null);
                  if (fresh === item.id) setFresh(null);
                }}
                onCancel={() => discardIfFresh(item.id)}
                onDelete={() => {
                  setItems((prev) => prev.filter((i) => i.id !== item.id));
                  setAnnouncement(`Angle ${index + 1} deleted.`);
                }}
                onMove={(delta) => reorder(index, index + delta)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {items.length < MAX_ITEMS ? (
        <button
          type="button"
          disabled={locked}
          onClick={add}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add an angle
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">
          You have reached the limit of {MAX_ITEMS} angles.
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive bg-card p-3 text-sm">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border bg-background px-4 py-3 sm:mx-0 sm:rounded-lg sm:border">
        {asking && (
          <div className="flex flex-col gap-2">
            <label htmlFor="replan-feedback" className="text-sm font-medium">
              What should the new plan change?
            </label>
            <Textarea
              id="replan-feedback"
              value={feedback}
              maxLength={500}
              placeholder="e.g. focus on Europe"
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={locked || feedback.trim().length < 3}
                onClick={() => onReplan(feedback.trim())}
              >
                Send feedback
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={locked}
            aria-expanded={asking}
            onClick={() => setAsking((v) => !v)}
          >
            <MessageSquareText aria-hidden="true" />
            Ask for a new plan
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              disabled={locked || blocker !== null || editingId !== null}
              aria-describedby={blocker ? "approve-hint" : undefined}
              onClick={() => onApprove(toPayload(items))}
            >
              Approve and start research
            </Button>
            {blocker && (
              <p id="approve-hint" className="text-xs text-muted-foreground">
                {blocker}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
