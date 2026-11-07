import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { AccountBadge } from "@/components/layout/account-badge";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <Link href="/dashboard" className="font-sans text-lg font-semibold">
        Scholar
      </Link>
      <div className="flex items-center gap-3">
        <AccountBadge />
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
