"use client";

import { ExternalLink, Globe } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type PanelSource = {
  url: string;
  title: string;
  domain: string;
  quote: string | null;
  /** Citation number once the report exists; research-time sources have none yet. */
  num?: number;
};

// Reserved test domains have no favicon; do not ask the icon service about them.
const NO_FAVICON = /(\.example|\.test|\.invalid|\.localhost)$|^localhost$/i;

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || NO_FAVICON.test(domain))
    return <Globe aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny third-party icon, not worth next/image
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      width={16}
      height={16}
      referrerPolicy="no-referrer"
      className="size-4 shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

/** Title, domain, favicon, the quote the writer relied on, and a link out. */
export function SourceCard({ source, active }: { source: PanelSource; active?: boolean }) {
  return (
    <article
      id={source.num ? `source-${source.num}` : undefined}
      aria-label={source.num ? `Source ${source.num}: ${source.title}` : source.title}
      data-active={active ? "true" : undefined}
      className={cn(
        "rounded-lg border border-border bg-card p-3 text-sm transition-colors duration-200",
        active && "border-primary bg-highlight",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {source.num !== undefined && (
          <span className="font-mono font-semibold text-foreground">{source.num}</span>
        )}
        <Favicon domain={source.domain} />
        <span className="truncate font-mono">{source.domain}</span>
      </div>
      <h3 className="mt-1 font-medium">{source.title}</h3>
      {source.quote && <p className="mt-1 line-clamp-4 text-muted-foreground">“{source.quote}”</p>}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:min-h-0"
      >
        Open source
        <ExternalLink aria-hidden="true" className="size-3.5" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </article>
  );
}
