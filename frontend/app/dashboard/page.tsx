import { AppShell } from "@/components/layout/app-shell";
import { Desk } from "@/components/research/desk";

export default function DashboardPage() {
  return (
    <AppShell>
      <h1 className="sr-only">New research</h1>
      <Desk />
    </AppShell>
  );
}
