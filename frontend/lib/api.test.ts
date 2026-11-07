import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "./api";

vi.mock("@clerk/nextjs", () => ({ useAuth: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("sends the Clerk token as a Bearer header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/me", async () => "tok_123");

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer tok_123");
  });

  it("throws a typed ApiError with the status and detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: "Invalid or missing credentials" }), {
            status: 401,
          }),
        ),
    );

    await expect(apiFetch("/me", async () => null)).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Invalid or missing credentials",
    });
    await expect(apiFetch("/me", async () => null)).rejects.toBeInstanceOf(ApiError);
  });
});
