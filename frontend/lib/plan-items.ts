export const MIN_LENGTH = 5;
export const MAX_LENGTH = 300;
export const MAX_ITEMS = 8;

export type PlanDraftItem = { id: string; text: string; reason: string | null };

let counter = 0;
export const newId = () => `plan-item-${++counter}`;

export function fromPlan(plan: { text: string; reason: string | null }[]): PlanDraftItem[] {
  return plan.map((p) => ({ id: newId(), text: p.text, reason: p.reason }));
}

/** Returns a new array with the item at `from` moved to `to`; out-of-range moves change nothing. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function textError(text: string): string | null {
  const length = text.trim().length;
  if (length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (length > MAX_LENGTH) return `Keep it under ${MAX_LENGTH} characters.`;
  return null;
}

/** Why the plan cannot be approved yet, or null when it can. */
export function approvalBlocker(items: PlanDraftItem[]): string | null {
  if (items.length === 0) return "Add at least one angle to approve the plan.";
  if (items.length > MAX_ITEMS) return `Use at most ${MAX_ITEMS} angles.`;
  if (items.some((i) => textError(i.text))) return "Fix the angles marked below before approving.";
  return null;
}

export function toPayload(items: PlanDraftItem[]) {
  return items.map((i) => ({ text: i.text.trim(), reason: i.reason }));
}
