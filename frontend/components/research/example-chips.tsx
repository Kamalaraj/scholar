import { EXAMPLE_BRIEFS } from "@/lib/examples";

/** Suggestion cards under the composer, like the starter prompts in ChatGPT and Claude. */
export function ExampleChips({ onPick }: { onPick: (question: string) => void }) {
  return (
    <ul aria-label="Example briefs" className="grid gap-2 sm:grid-cols-3">
      {EXAMPLE_BRIEFS.map((example) => (
        <li key={example} className="flex">
          <button
            type="button"
            onClick={() => onPick(example)}
            className="min-h-11 w-full rounded-2xl border border-border bg-card p-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            {example}
          </button>
        </li>
      ))}
    </ul>
  );
}
