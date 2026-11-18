// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "./proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  // With a production Clerk key on *.vercel.app, clerkMiddleware serves Clerk's
  // Frontend API (including clerk.browser.js) from /__clerk. If the matcher
  // skips it, the script 404s and the sign-in form never renders.
  it("routes Clerk proxy requests, including .js files, through the middleware", () => {
    expect(matches("/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js")).toBe(true);
    expect(matches("/__clerk/npm/@clerk/ui@1/dist/ui.browser.js")).toBe(true);
    expect(matches("/__clerk/v1/client")).toBe(true);
  });

  it("runs on pages and skips Next internals and static files", () => {
    expect(matches("/sign-in")).toBe(true);
    expect(matches("/dashboard")).toBe(true);
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/icon.svg")).toBe(false);
  });
});
