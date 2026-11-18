import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * ChatGPT/Claude-style shell: a fixed sidebar (history, account, theme) on desktop, a slim top
 * bar plus menu sheet on mobile, and one centered `<main id="main">` (the skip link's target).
 */
export function AppShell({
  children,
  width = "narrow",
}: {
  children: React.ReactNode;
  width?: "narrow" | "wide" | "full";
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-4 p-3">
          <Link href="/dashboard" aria-label="Scholar home" className="px-3 pt-1">
            <Logo animated />
          </Link>
          <SidebarNav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 outline-none sm:px-6 sm:py-10 lg:px-8 xl:px-10",
            // Content uses the available width; only the reading-first screens cap it on huge monitors.
            width === "narrow" && "max-w-6xl",
            width === "wide" && "max-w-[96rem]",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
