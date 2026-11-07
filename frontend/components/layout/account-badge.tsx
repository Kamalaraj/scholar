"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

export function AccountBadge() {
  const api = useApi();
  const { data, error, isPending } = useQuery({ queryKey: ["me"], queryFn: api.me });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading your account…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        We could not load your account. Try reloading the page.
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">Signed in as {data.email ?? data.clerk_user_id}</p>
  );
}
