import { RunSummary } from "@/components/research/run-summary";
import { TopBar } from "@/components/layout/top-bar";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[880px] px-4 py-8 sm:px-6 sm:py-12">
        <RunSummary runId={id} />
      </main>
    </div>
  );
}
