import { UserButton } from "@clerk/nextjs";
import { Plus } from "lucide-react";
import Link from "next/link";

import { AccountBadge } from "@/components/layout/account-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

/** Slim top bar: logo, New brief, Settings, theme toggle, account. No sidebar in the MVP. */
export function TopBar() {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="font-sans text-lg font-semibold">
          Scholar
        </Link>
        <Link
          href="/dashboard#brief"
          className={buttonVariants({ size: "sm", className: "min-h-11 sm:min-h-8" })}
        >
          <Plus aria-hidden="true" />
          New brief
        </Link>
      </div>
      <nav aria-label="Account" className="flex items-center gap-1 sm:gap-3">
        <AccountBadge />
        <Link
          href="/settings"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "min-h-11 sm:min-h-8",
          })}
        >
          Settings
        </Link>
        <ThemeToggle />
        <UserButton />
      </nav>
    </header>
  );
}
