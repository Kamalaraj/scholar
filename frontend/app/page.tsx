import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { WorkspaceIllustration } from "@/components/marketing/workspace-illustration";
import { ThemeToggle } from "@/components/theme-toggle";

const steps = [
  { title: "Write a brief", body: "Describe what you want to find out, in your own words." },
  { title: "Approve the plan", body: "Review the research angles an agent drafts, and edit them." },
  { title: "Read the cited report", body: "Every claim links back to the source it came from." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-sans text-lg font-semibold">Scholar</span>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className={buttonVariants({ variant: "ghost", className: "min-h-11 sm:min-h-8" })}
          >
            Sign in
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <main
        id="main"
        className="mx-auto flex max-w-4xl flex-col items-start gap-8 px-6 py-16 sm:py-24"
      >
        <h1 className="font-serif text-4xl font-semibold leading-tight sm:text-5xl">
          Research briefs, written by a team of agents you direct.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          You write the question. A planner drafts a research plan, you approve it, and agents
          search and read the web to write a cited report.
        </p>
        <Link href="/sign-in" className={buttonVariants({ size: "lg", className: "min-h-11" })}>
          Start researching
        </Link>

        <WorkspaceIllustration />

        <ol className="grid w-full gap-6 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-lg border border-border bg-card p-4 text-card-foreground"
            >
              <span className="font-mono text-sm text-primary">{index + 1}</span>
              <h2 className="mt-2 font-sans text-base font-semibold">{step.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
