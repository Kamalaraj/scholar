import { ApiError } from "@/lib/api";

/** "in about 3 hours" / "in about 20 minutes" for a time in the future. */
export function untilText(resetAt: Date, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.round((resetAt.getTime() - now.getTime()) / 60_000));
  if (minutes < 90) return `in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  return `in about ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** A friendly sentence for any API error; rate limits say when the user can try again. */
export function friendlyError(error: unknown, fallback: string, now: Date = new Date()): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 429 && error.resetAt) {
    const reset = new Date(error.resetAt);
    if (!Number.isNaN(reset.getTime())) {
      const at = reset.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
      return `${error.message} You can start another at ${at} (${untilText(reset, now)}).`;
    }
  }
  return error.message || fallback;
}
