import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

import type { components } from "@/lib/api-types";
import { runsQuery, type RunFilters } from "@/lib/library-filters";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export type User = components["schemas"]["UserOut"];
export type Run = components["schemas"]["RunOut"];
export type RunDetail = components["schemas"]["RunDetail"];
export type PlanAction = components["schemas"]["PlanAction"];
export type Report = components["schemas"]["ReportOut"];
export type Source = components["schemas"]["SourceOut"];
export type RunList = components["schemas"]["RunList"];
export type RunStatus = Run["status"];
export type Usage = components["schemas"]["UsageOut"];
export type Depth = Run["depth"];

export class ApiError extends Error {
  readonly status: number;
  /** When a rate limit renews (ISO time from the X-RateLimit-Reset header), if the API said. */
  readonly resetAt: string | null;

  constructor(status: number, message: string, resetAt: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.resetAt = resetAt;
  }
}

type GetToken = () => Promise<string | null>;

/** Single fetch wrapper: attaches the Clerk session token as a Bearer header. */
export async function apiFetch<T>(
  path: string,
  getToken: GetToken,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new ApiError(response.status, message, response.headers.get("X-RateLimit-Reset"));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Same auth as apiFetch, for endpoints that return plain text (the Markdown export). */
export async function apiFetchText(path: string, getToken: GetToken): Promise<string> {
  const token = await getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) throw new ApiError(response.status, response.statusText);
  return response.text();
}

export function useApi() {
  const { getToken } = useAuth();
  const get = useCallback(() => getToken(), [getToken]);
  return {
    me: () => apiFetch<User>("/me", get),
    usage: () => apiFetch<Usage>("/me/usage", get),
    createRun: (body: { question: string; depth: Depth }) =>
      apiFetch<Run>("/runs", get, { method: "POST", body: JSON.stringify(body) }),
    listRuns: (cursor?: string | null, filters: RunFilters = {}) =>
      apiFetch<RunList>(`/runs?${runsQuery(cursor, filters)}`, get),
    getRun: (id: string) => apiFetch<RunDetail>(`/runs/${encodeURIComponent(id)}`, get),
    submitPlan: (id: string, body: PlanAction) =>
      apiFetch<Run>(`/runs/${encodeURIComponent(id)}/plan`, get, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    reportMarkdown: (id: string) => apiFetchText(`/runs/${encodeURIComponent(id)}/report.md`, get),
    cancelRun: (id: string) =>
      apiFetch<Run>(`/runs/${encodeURIComponent(id)}/cancel`, get, { method: "POST" }),
    retryRun: (id: string) =>
      apiFetch<Run>(`/runs/${encodeURIComponent(id)}/retry`, get, { method: "POST" }),
    deleteRun: (id: string) =>
      apiFetch<void>(`/runs/${encodeURIComponent(id)}`, get, { method: "DELETE" }),
  };
}
