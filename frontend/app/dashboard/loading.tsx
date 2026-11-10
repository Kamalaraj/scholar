import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton in the final layout shape: composer, then five report rows. */
export default function Loading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-12" aria-busy="true">
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
