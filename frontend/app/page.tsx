import {
  ArrowRight,
  BookOpenCheck,
  ListChecks,
  LockKeyhole,
  PenLine,
  Radar,
  Quote,
} from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/layout/auth-showcase";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { EXAMPLE_BRIEFS } from "@/lib/examples";

const STEPS = [
  {
    icon: PenLine,
    title: "Write a brief",
    body: "Describe what you want to find out, in your own words. Pick Quick or Deep.",
  },
  {
    icon: ListChecks,
    title: "Approve the plan",
    body: "A planner drafts the angles to research. Edit, reorder or skip the review.",
  },
  {
    icon: BookOpenCheck,
    title: "Read the cited report",
    body: "Agents search and read the web, then a writer links every claim to its source.",
  },
];

const FEATURES = [
  {
    icon: ListChecks,
    title: "You direct the research",
    body: "Nothing expensive runs until you approve the plan. Cancel any run at any time.",
  },
  {
    icon: Radar,
    title: "Watch it happen",
    body: "Each angle gets its own lane. Sources appear as they are found, and reloading loses nothing.",
  },
  {
    icon: Quote,
    title: "Every claim cited",
    body: "Numbered citations open the exact source and the quote the writer relied on.",
  },
  {
    icon: LockKeyhole,
    title: "Private by default",
    body: "Your reports belong to your account. Other users can never open them.",
  },
];

const MARQUEE = [
  ...EXAMPLE_BRIEFS,
  "How do heat pumps compare with gas boilers in cold climates?",
  "What does recent evidence say about intermittent fasting?",
  "How are cities reducing traffic deaths?",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[110rem] items-center justify-between px-4 py-3 sm:px-6 lg:px-12">
          <Link href="/" aria-label="Scholar home">
            <Logo animated />
          </Link>
          <nav aria-label="Account" className="flex items-center gap-1 sm:gap-2">
            <a
              href="#how"
              className={buttonVariants({
                variant: "ghost",
                className: "hidden min-h-11 sm:inline-flex sm:min-h-8",
              })}
            >
              How it works
            </a>
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: "ghost", className: "min-h-11 sm:min-h-8" })}
            >
              Sign in
            </Link>
            <span className="hidden sm:block">
              {" "}
              <Link
                href="/sign-up"
                className={buttonVariants({
                  className: "min-h-11 rounded-full sm:min-h-8",
                })}
              >
                Get started
              </Link>
            </span>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="bg-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(50%_100%_at_50%_0%,color-mix(in_srgb,var(--brand)_16%,transparent),transparent)]"
          />
          <div className="relative mx-auto grid max-w-[110rem] items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:px-12 2xl:py-28">
            <div className="flex min-w-0 flex-col items-start gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-700">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
                <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                Cited research in about a minute
              </span>
              <h1 className="font-serif text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl xl:text-6xl 2xl:text-7xl">
                Research briefs, written by a team of agents you direct.
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground 2xl:text-xl">
                You write the question. A planner drafts a research plan, you approve it, and agents
                search and read the web to write a cited report.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/sign-in"
                  className={buttonVariants({
                    size: "lg",
                    className: "min-h-11 rounded-full px-6",
                  })}
                >
                  Start researching
                  <ArrowRight aria-hidden="true" />
                </Link>
                <a
                  href="#how"
                  className={buttonVariants({
                    variant: "outline",
                    size: "lg",
                    className: "min-h-11 rounded-full px-6",
                  })}
                >
                  See how it works
                </a>
              </div>
            </div>

            <div className="min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:delay-150 motion-safe:duration-1000">
              <div className="rounded-3xl border border-border bg-sidebar p-4 shadow-sm sm:p-5 2xl:p-8">
                <div aria-hidden="true" className="mb-4 flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                </div>
                <AuthShowcase />
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Example questions"
          className="overflow-hidden border-y border-border py-4"
        >
          <div aria-hidden="true" className="animate-marquee flex w-max gap-3">
            {[...MARQUEE, ...MARQUEE].map((q, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm whitespace-nowrap text-muted-foreground"
              >
                {q}
              </span>
            ))}
          </div>
          <ul className="sr-only">
            {MARQUEE.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>

        <section
          id="how"
          className="mx-auto flex max-w-[110rem] scroll-mt-16 flex-col gap-10 px-4 py-16 sm:px-6 lg:px-12 sm:py-24"
        >
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 className="text-3xl font-semibold tracking-tight">
              From question to report in three steps
            </h2>
            <p className="text-lg text-muted-foreground">
              No prompt engineering. Ask the way you would ask a colleague.
            </p>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="group flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 transition-colors duration-200 hover:bg-accent"
              >
                <span className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-muted transition-transform duration-200 group-hover:scale-105">
                    <step.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">0{index + 1}</span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-lg font-semibold">{step.title}</span>
                  <span className="text-muted-foreground">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border bg-sidebar">
          <div className="mx-auto grid max-w-[110rem] gap-4 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:px-12 sm:py-20 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col gap-2">
                <f.icon aria-hidden="true" className="size-5 text-brand" />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[110rem] px-4 py-16 sm:px-6 lg:px-12 sm:py-24">
          <div className="flex flex-col items-center gap-6 rounded-3xl border border-border bg-card px-6 py-14 text-center">
            <Logo showWordmark={false} markClassName="size-12" animated />
            <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
              Ask your first question
            </h2>
            <p className="max-w-md text-muted-foreground">
              Free to try. Sign up and get your first cited report in about a minute.
            </p>
            <Link
              href="/sign-up"
              className={buttonVariants({ size: "lg", className: "min-h-11 rounded-full px-6" })}
            >
              Create a free account
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-12">
          <Logo markClassName="size-6" className="[&>span]:text-base" />
          <p>Reports are drafted by AI from web sources. Check the citations.</p>
        </div>
      </footer>
    </div>
  );
}
