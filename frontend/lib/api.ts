import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

import type { components } from "@/lib/api-types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export type User = components["schemas"]["UserOut"];
export type Run = components["schemas"]["RunOut"];
export type RunDetail = components["schemas"]["RunDetail"];
export type RunList = components["schemas"]["RunList"];
export type RunStatus = Run["status"];
export type Depth = Run["depth"];

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function useApi() {
  const { getToken } = useAuth();
  const get = useCallback(() => getToken(), [getToken]);
  return {
    me: () => apiFetch<User>("/me", get),
    createRun: (body: { question: string; depth: Depth }) =>
      apiFetch<Run>("/runs", get, { method: "POST", body: JSON.stringify(body) }),
    listRuns: (cursor?: string | null) =>
      apiFetch<RunList>(
        `/runs?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        get,
      ),
    getRun: (id: string) => apiFetch<RunDetail>(`/runs/${encodeURIComponent(id)}`, get),
    deleteRun: (id: string) =>
      apiFetch<void>(`/runs/${encodeURIComponent(id)}`, get, { method: "DELETE" }),
  };
}
