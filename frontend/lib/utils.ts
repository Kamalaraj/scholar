export { cn } from "cn";

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "5 minutes ago", "yesterday"; falls back to "just now" under a minute. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (abs >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
