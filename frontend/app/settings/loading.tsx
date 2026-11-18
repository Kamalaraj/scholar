import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-36 rounded-lg" />
      </div>
    </AppShell>
  );
}
