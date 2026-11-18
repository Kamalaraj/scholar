"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Library, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarHistory } from "@/components/layout/sidebar-history";
import { ThemeToggle } from "@/components/theme-toggle";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const ITEM =
  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-accent sm:min-h-9";

function NavLink({
  href,
  icon: Icon,
  children,
  onNavigate,
}: {
  href: string;
  icon: typeof Plus;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(ITEM, active && "bg-accent")}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Sidebar content, shared by the desktop sidebar and the mobile menu sheet. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const api = useApi();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        <NavLink href="/dashboard" icon={Plus} onNavigate={onNavigate}>
          New research
        </NavLink>
        <NavLink href="/library" icon={Library} onNavigate={onNavigate}>
          Library
        </NavLink>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarHistory onNavigate={onNavigate} />
      </div>
      <div className="flex items-center gap-1 border-t border-border pt-3">
        <UserButton />
        <span className="min-w-0 flex-1 truncate px-1 text-sm text-muted-foreground">
          {me?.email ?? ""}
        </span>
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-label="Settings"
          className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-accent"
        >
          <Settings className="size-4" aria-hidden="true" />
        </Link>
        <ThemeToggle />
      </div>
    </div>
  );
}
