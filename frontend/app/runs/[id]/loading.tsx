import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-16 w-2/3 rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    </AppShell>
  );
}
