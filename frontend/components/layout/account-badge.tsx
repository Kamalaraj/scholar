"use client";

import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/lib/api";

/** Shows the signed-in email in the top bar. Loading and error states stay quiet on purpose. */
export function AccountBadge() {
  const api = useApi();
  const { data } = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (!data) return null;
  return (
    <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
      {data.email ?? data.clerk_user_id}
    </span>
  );
}
