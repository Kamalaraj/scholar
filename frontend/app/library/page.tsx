import { AppShell } from "@/components/layout/app-shell";
import { RunsLibrary } from "@/components/research/runs-library";

export const metadata = { title: "Library · Scholar" };

export default function LibraryPage() {
  return (
    <AppShell>
      <RunsLibrary />
    </AppShell>
  );
}
