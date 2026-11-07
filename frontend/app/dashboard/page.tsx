import { Desk } from "@/components/research/desk";
import { TopBar } from "@/components/layout/top-bar";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[880px] px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="sr-only">Your desk</h1>
        <Desk />
      </main>
    </div>
  );
}
