import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton in the final layout shape: greeting and composer. */
export default function Loading() {
  return (
    <AppShell>
      <div className="my-auto flex flex-col items-center gap-6" aria-busy="true">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    </AppShell>
  );
}
