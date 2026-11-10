"use client";

import { Check, Copy, Download } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useApi, type Report, type Source } from "@/lib/api";
import { allowCitationUrls, citationNumber, linkCitations } from "@/lib/citations";
import { cn } from "@/lib/utils";

/** `onHighlight` and `onOpen` must be stable (memoised): changing them remounts every citation. */
type Props = {
  runId: string;
  question: string;
  depth: "quick" | "deep";
  date: string;
  report: Report;
  sources: Source[];
  onHighlight: (num: number | null) => void;
  onOpen: (num: number) => void;
};

/** A superscript button; hovering or focusing it highlights the source, clicking opens it. */
function Citation({
  num,
  source,
  onHighlight,
  onOpen,
}: {
  num: number;
  source: Source | undefined;
  onHighlight: (num: number | null) => void;
  onOpen: (num: number) => void;
}) {
  return (
    <sup className="font-sans">
      <button
        type="button"
        aria-label={`Source ${num}: ${source ? `${source.title}, ${source.domain}` : "not found"}`}
        className="relative mx-px inline-block rounded px-1 text-[1em] leading-[1.4] font-semibold text-primary hover:bg-highlight focus-visible:bg-highlight focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none before:absolute before:-inset-x-2.5 before:-inset-y-4 before:content-['']"
        onMouseEnter={() => onHighlight(num)}
        onMouseLeave={() => onHighlight(null)}
        onFocus={() => onHighlight(num)}
        onBlur={() => onHighlight(null)}
        onClick={() => onOpen(num)}
      >
        {num}
      </button>
    </sup>
  );
}

export function ReportView({
  runId,
  question,
  depth,
  date,
  report,
  sources,
  onHighlight,
  onOpen,
}: Props) {
  const api = useApi();
  const [copied, setCopied] = useState(false);
  const byNum = useMemo(() => new Map(sources.map((s) => [s.citation_num, s])), [sources]);
  const valid = useMemo(() => new Set(byNum.keys()), [byNum]);
  // No rehype-raw: raw HTML in the report is never rendered. Links open safely in a new tab.
  const components: Components = useMemo(
    () => ({
      a({ href, children }) {
        const num = citationNumber(href);
        if (num !== null) {
          return (
            <Citation num={num} source={byNum.get(num)} onHighlight={onHighlight} onOpen={onOpen} />
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
      table: ({ children }) => (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      ),
    }),
    [byNum, onHighlight, onOpen],
  );
  const inline: Components = useMemo(
    () => ({ ...components, p: ({ children }) => <>{children}</> }),
    [components],
  );

  async function markdown(): Promise<string> {
    return api.reportMarkdown(runId);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(await markdown());
      setCopied(true);
      toast.success("Report copied as Markdown");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the report");
    }
  }

  async function download() {
    try {
      const url = URL.createObjectURL(new Blob([await markdown()], { type: "text/markdown" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${
        question
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50) || "report"
      }.md`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch {
      toast.error("Could not download the report");
    }
  }

  return (
    <article aria-labelledby="report-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h2 id="report-title" className="font-serif text-[28px] leading-9 font-semibold">
          {question}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {new Date(date).toLocaleDateString("en", { dateStyle: "medium" })} ·{" "}
            {depth === "deep" ? "Deep" : "Quick"} · {sources.length} sources
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              Copy
            </Button>
            <Button type="button" variant="outline" onClick={download}>
              <Download aria-hidden="true" />
              Download .md
            </Button>
          </div>
        </div>
      </header>

      {report.key_findings.length > 0 && (
        <section
          aria-labelledby="key-findings"
          className="rounded-lg border border-border bg-muted p-4"
        >
          <h3 id="key-findings" className="text-base font-semibold">
            Key findings
          </h3>
          <ul className={cn("report-prose mt-2 list-disc pl-5 text-base leading-7")}>
            {report.key_findings.map((finding, i) => (
              <li key={i}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  urlTransform={allowCitationUrls}
                  components={inline}
                >
                  {linkCitations(finding, valid)}
                </ReactMarkdown>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="report-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={allowCitationUrls}
          components={components}
        >
          {linkCitations(report.markdown, valid)}
        </ReactMarkdown>
      </div>
    </article>
  );
}
