"use client";

import { SourceCard, type PanelSource } from "@/components/research/source-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActivityEntry } from "@/lib/run-events";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export type PanelTab = "sources" | "activity";

/** Context panel: Sources (default) and Activity, a plain-language timeline. */
export function ActivityPanel({
  activity,
  sources,
  activeNum,
  tab,
  onTabChange,
}: {
  activity: ActivityEntry[];
  sources: PanelSource[];
  /** Citation number to highlight (hovered or last clicked in the report). */
  activeNum?: number | null;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange(v as PanelTab)}
      className="rounded-lg border border-border bg-card p-4"
    >
      <TabsList>
        <TabsTrigger value="sources">Sources ({sources.length})</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="sources">
        {sources.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Sources appear here as they are found.
          </p>
        ) : (
          <ol aria-label="Sources" className="mt-3 flex flex-col gap-3">
            {sources.map((s) => (
              <li key={s.url} className="scroll-mt-20">
                <SourceCard source={s} active={s.num !== undefined && s.num === activeNum} />
              </li>
            ))}
          </ol>
        )}
      </TabsContent>
      <TabsContent value="activity">
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ol aria-label="Activity" className="mt-3 flex flex-col gap-2">
            {activity.map((a) => (
              <li key={a.seq} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{time(a.at)}</span>{" "}
                {a.text}
              </li>
            ))}
          </ol>
        )}
      </TabsContent>
    </Tabs>
  );
}
