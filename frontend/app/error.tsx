"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Last-resort error screen: plain words, a retry, and the digest so a log line can be found. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 px-6"
    >
      <h1 className="font-serif text-3xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        We could not show this page. Your reports are safe. Try again, and if it keeps happening,
        reload the page.
      </p>
      <Button onClick={reset}>Try again</Button>
      {error.digest && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Details</summary>
          <p className="mt-1 font-mono text-[13px]">Error id: {error.digest}</p>
        </details>
      )}
    </main>
  );
}
