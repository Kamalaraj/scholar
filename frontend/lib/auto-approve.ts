const key = (runId: string) => `scholar:auto-approve:${runId}`;

/** Remember, for this browser tab, that a run should start researching without plan review. */
export function markAutoApprove(runId: string): void {
  try {
    sessionStorage.setItem(key(runId), "1");
  } catch {
    // Storage can be blocked; the user just reviews the plan instead.
  }
}

export function wantsAutoApprove(runId: string): boolean {
  try {
    return sessionStorage.getItem(key(runId)) === "1";
  } catch {
    return false;
  }
}

export function clearAutoApprove(runId: string): void {
  try {
    sessionStorage.removeItem(key(runId));
  } catch {
    // Nothing to clear.
  }
}
