import { TopBar } from "@/components/layout/top-bar";
import { AccountBadge } from "@/components/layout/account-badge";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[880px] px-6 py-12">
        <h1 className="text-2xl font-semibold">Your desk</h1>
        <div className="mt-2">
          <AccountBadge />
        </div>
        <p className="mt-6 text-muted-foreground">
          The brief composer and your reports arrive in the next phase.
        </p>
      </main>
    </div>
  );
}
