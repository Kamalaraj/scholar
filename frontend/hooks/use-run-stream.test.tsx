import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRunStream } from "@/hooks/use-run-stream";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ getToken: async () => "tok" }) }));

const sse = (seq: number, type: string, payload: object) =>
  `id: ${seq}\nevent: ${type}\ndata: ${JSON.stringify({ seq, type, payload, created_at: "2026-01-01T00:00:00Z" })}\n\n`;

function streamOf(chunks: string[], close = true): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((c) => controller.enqueue(enc.encode(c)));
        if (close) controller.close();
      },
    }),
    { status: 200 },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("useRunStream", () => {
  it("sends the token in a header and resumes from the last seq after a drop", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamOf([
          sse(1, "status", { status: "planning" }),
          sse(2, "status", { status: "awaiting_approval" }),
        ]),
      )
      .mockResolvedValueOnce(
        streamOf([sse(2, "status", { status: "awaiting_approval" }), sse(3, "run_completed", {})]),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useRunStream("run-1"));
    await waitFor(() => expect(result.current.connection).toBe("closed"), { timeout: 4000 });

    expect(result.current.view.lastSeq).toBe(3);
    expect(result.current.view.status).toBe("awaiting_approval");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("tok");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(fetchMock.mock.calls[1][0]).toContain("after_seq=2");
  });
});
