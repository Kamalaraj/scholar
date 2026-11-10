import { TopBar } from "@/components/layout/top-bar";
import { cn } from "@/lib/utils";

/** Top bar plus a centered `<main id="main">` (the skip link's target). */
export function AppShell({
  children,
  width = "narrow",
}: {
  children: React.ReactNode;
  width?: "narrow" | "wide";
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          "mx-auto px-4 py-8 outline-none sm:px-6 sm:py-12",
          width === "narrow" ? "max-w-[880px]" : "max-w-[1280px]",
        )}
      >
        {children}
      </main>
    </div>
  );
}
