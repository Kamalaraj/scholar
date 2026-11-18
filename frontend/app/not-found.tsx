import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-xl flex-col items-start justify-center gap-4 px-6"
    >
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="font-serif text-3xl font-semibold">We could not find that page</h1>
      <p className="text-muted-foreground">
        The link may be old, or the page may have moved. Your reports are on your desk.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard" className={buttonVariants()}>
          Go to your desk
        </Link>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
