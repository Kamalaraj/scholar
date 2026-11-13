import { cn } from "@/lib/utils";

/**
 * Scholar mark: a research graph (three nodes, a center node and a green result dot) on a rounded
 * tile. The tile follows the theme (ink on light, paper on dark); the glyph is the inverse.
 * The green dot is the brand color and stays the same in both themes.
 */
export function LogoMark({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0", animated && "logo-animated", className)}
    >
      <rect width="100" height="100" rx="24" style={{ fill: "var(--foreground)" }} />
      <g style={{ stroke: "var(--background)" }} strokeWidth="5" strokeLinecap="butt" fill="none">
        <path
          className="logo-edge"
          pathLength={1}
          d="M50 23.6 L25.5 49.8 L50 74.5 L74.2 49.8 Z"
          strokeLinejoin="miter"
        />
        <path className="logo-edge" pathLength={1} d="M50 23.6 V74.5" />
      </g>
      <g style={{ fill: "var(--background)" }}>
        <circle cx="50" cy="23.6" r="8.2" />
        <circle cx="25.5" cy="49.8" r="8.2" />
        <circle cx="74.2" cy="49.8" r="8.2" />
      </g>
      <circle cx="50" cy="49.8" r="7.4" style={{ fill: "var(--background)" }} />
      <circle cx="50" cy="49.8" r="3.6" style={{ fill: "var(--foreground)" }} />
      <circle
        className="logo-ping"
        cx="50"
        cy="74.5"
        r="9.5"
        style={{ fill: "var(--brand-mark)" }}
      />
      <circle
        cx="50"
        cy="74.5"
        r="9.5"
        strokeWidth="3.5"
        style={{ fill: "var(--brand-mark)", stroke: "var(--foreground)" }}
      />
    </svg>
  );
}

/** Mark plus the "Scholar" wordmark. Use `showWordmark={false}` for tight spaces. */
export function Logo({
  className,
  markClassName,
  showWordmark = true,
  animated = false,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  animated?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} animated={animated} />
      {showWordmark ? (
        <span className="font-sans text-lg font-bold tracking-tight">Scholar</span>
      ) : (
        <span className="sr-only">Scholar</span>
      )}
    </span>
  );
}
