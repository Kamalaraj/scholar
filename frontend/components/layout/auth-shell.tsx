import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/layout/auth-showcase";
import { ThemeToggle } from "@/components/theme-toggle";

/** Sign-in and sign-up frame: a quiet brand panel beside the Clerk card (card only on mobile). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-dots relative hidden flex-col justify-between border-r border-border bg-sidebar p-10 lg:flex">
        <Link href="/" aria-label="Scholar home">
          <Logo animated markClassName="size-9" />
        </Link>
        <div className="flex max-w-md flex-col gap-8">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Research briefs, written by a team of agents you direct.
          </h2>
          <AuthShowcase />
        </div>
        <p className="text-sm text-muted-foreground">Free to try. Your reports stay private.</p>
      </aside>
      <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-16">
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <ThemeToggle />
        </div>
        <Link href="/" aria-label="Scholar home" className="lg:hidden">
          <Logo animated />
        </Link>
        {children}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground sm:min-h-8"
        >
          Back to home
        </Link>
      </main>
    </div>
  );
}
