import { EXAMPLE_BRIEFS } from "@/lib/examples";

export function ExampleChips({ onPick }: { onPick: (question: string) => void }) {
  return (
    <ul aria-label="Example briefs" className="flex flex-wrap gap-2">
      {EXAMPLE_BRIEFS.map((example) => (
        <li key={example}>
          <button
            type="button"
            onClick={() => onPick(example)}
            className="min-h-11 rounded-full border border-border bg-muted px-3 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:min-h-8"
          >
            {example}
          </button>
        </li>
      ))}
    </ul>
  );
}
