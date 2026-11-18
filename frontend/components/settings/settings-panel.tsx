"use client";

import { useClerk } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useApi } from "@/lib/api";
import { untilText } from "@/lib/rate-limit";

const THEMES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

const noopSubscribe = () => () => {};

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Profile() {
  const api = useApi();
  const { openUserProfile } = useClerk();
  const { data, isPending, isError } = useQuery({ queryKey: ["me"], queryFn: api.me });
  return (
    <Section title="Profile" id="profile-heading">
      {isPending && <Skeleton className="h-6 w-64" />}
      {isError && (
        <p role="alert" className="text-sm text-muted-foreground">
          We could not load your profile.
        </p>
      )}
      {data && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            Signed in as <span className="font-medium">{data.email ?? data.clerk_user_id}</span>
          </p>
          <Button
            variant="outline"
            className="min-h-11 sm:min-h-8"
            onClick={() => openUserProfile()}
          >
            Manage account
          </Button>
        </div>
      )}
    </Section>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored choice on the client.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return (
    <Section title="Theme" id="theme-heading">
      {mounted ? (
        <ToggleGroup
          aria-label="Theme"
          value={[theme ?? "system"]}
          onValueChange={(values) => values[0] && setTheme(values[0])}
          variant="outline"
          className="flex-col items-stretch sm:flex-row"
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="min-h-11 gap-2 px-4 aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-primary sm:min-h-8"
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
              {theme === value && <Check aria-hidden="true" className="size-4 text-primary" />}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <Skeleton className="h-11 w-72" />
      )}
    </Section>
  );
}

function Usage() {
  const api = useApi();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["usage"],
    queryFn: api.usage,
  });
  return (
    <Section title="Today's usage" id="usage-heading">
      {isPending && <Skeleton className="h-16 w-full max-w-md" />}
      {isError && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">We could not load your usage.</p>
          <Button variant="outline" className="min-h-11 sm:min-h-8" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      {data && (
        <div className="flex max-w-md flex-col gap-2">
          <p>
            <span className="font-mono text-lg font-semibold">{data.used}</span> of{" "}
            <span className="font-mono text-lg font-semibold">{data.limit}</span> reports started
            today
          </p>
          <Progress
            value={Math.min(100, (data.used / Math.max(data.limit, 1)) * 100)}
            aria-label={`${data.used} of ${data.limit} reports used today`}
            className="h-2"
          />
          <p className="text-sm text-muted-foreground">
            {data.used >= data.limit
              ? `You have used all of today's reports. More are available at ${new Date(data.resets_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })} (${untilText(new Date(data.resets_at))}).`
              : `The count resets at ${new Date(data.resets_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })} (${untilText(new Date(data.resets_at))}).`}
          </p>
        </div>
      )}
    </Section>
  );
}

export function SettingsPanel() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Profile />
      <Appearance />
      <Usage />
    </div>
  );
}
