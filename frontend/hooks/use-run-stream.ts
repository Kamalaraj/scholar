"use client";

import { useAuth } from "@clerk/nextjs";
import { createParser } from "eventsource-parser";
import { useEffect, useReducer, useRef, useState } from "react";

import { API_URL } from "@/lib/api";
import { applyEvent, emptyView, type RunEvent, type RunView } from "@/lib/run-events";

export type Connection = "connecting" | "live" | "reconnecting" | "closed";

const TERMINAL = new Set(["run_completed", "run_failed"]);
const MAX_BACKOFF_MS = 10_000;

/**
 * Follows `GET /runs/{id}/stream` with fetch (so the Clerk token goes in a header, never the URL).
 * Every (re)connect gets a fresh token and resumes from the last seq it has applied.
 */
export function useRunStream(runId: string): { view: RunView; connection: Connection } {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [view, dispatch] = useReducer(applyEvent, emptyView);
  const [connection, setConnection] = useState<Connection>("connecting");
  const lastSeq = useRef(0);

  useEffect(() => {
    const abort = new AbortController();
    let attempt = 0;
    let finished = false;
    lastSeq.current = 0;

    async function connect(): Promise<void> {
      while (!abort.signal.aborted && !finished) {
        try {
          const token = await getTokenRef.current();
          const response = await fetch(
            `${API_URL}/runs/${encodeURIComponent(runId)}/stream?after_seq=${lastSeq.current}`,
            {
              headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
              signal: abort.signal,
            },
          );
          if (response.status === 404 || response.status === 403) {
            finished = true;
            setConnection("closed");
            return;
          }
          if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

          setConnection("live");
          attempt = 0;
          const parser = createParser({
            onEvent(message) {
              if (!message.data) return;
              const event = JSON.parse(message.data) as RunEvent;
              if (event.seq <= lastSeq.current) return;
              lastSeq.current = event.seq;
              dispatch(event);
              if (TERMINAL.has(event.type)) finished = true;
            },
          });
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parser.feed(value);
          }
          if (finished) {
            setConnection("closed");
            return;
          }
        } catch {
          if (abort.signal.aborted) return;
        }
        // The stream dropped before the run ended: back off, then resume from lastSeq.
        setConnection("reconnecting");
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt++);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    void connect();
    return () => abort.abort();
  }, [runId]);

  return { view, connection };
}
