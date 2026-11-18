"use client";

import { Menu, SquarePen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/brand/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Mobile top bar: menu button, logo, quick "new research". The sheet holds the sidebar. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background px-2 py-1 lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" />
      </Button>
      <Link href="/dashboard" aria-label="Scholar home">
        <Logo markClassName="size-7" className="[&>span]:text-base" />
      </Link>
      <Link
        href="/dashboard"
        aria-label="New research"
        className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-accent"
      >
        <SquarePen className="size-5" aria-hidden="true" />
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar p-4">
          <SheetHeader className="p-0">
            <SheetTitle>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
