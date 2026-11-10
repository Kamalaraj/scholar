import type { ActivityEntry, LaneSource } from "@/lib/run-events";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Context panel: Sources (default) and Activity, a plain-language timeline. */
export function ActivityPanel({
  activity,
  sources,
}: {
  activity: ActivityEntry[];
  sources: LaneSource[];
}) {
  return (
    <Tabs defaultValue="sources" className="rounded-lg border border-border bg-card p-4">
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
          <ol className="mt-3 flex flex-col gap-3">
            {sources.map((s, i) => (
              <li key={s.url} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {i + 1}. {s.domain}
                </span>
                <p className="font-medium">{s.title}</p>
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
