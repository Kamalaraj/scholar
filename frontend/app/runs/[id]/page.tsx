import { AppShell } from "@/components/layout/app-shell";
import { RunWorkspace } from "@/components/research/run-workspace";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell width="wide">
      <RunWorkspace runId={id} />
    </AppShell>
  );
}
