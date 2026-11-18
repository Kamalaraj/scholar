const CITATION = /\[(\d+)\](?![(:])/g;
const PREFIX = "cite:";

/** Turn `[n]` markers that match a real source into `[n](cite:n)` links; others stay plain text. */
export function linkCitations(markdown: string, valid: ReadonlySet<number>): string {
  return markdown.replace(CITATION, (match, n: string) =>
    valid.has(Number(n)) ? `[${n}](${PREFIX}${n})` : match,
  );
}

/** The source number behind a `cite:n` href, or null for any other link. */
export function citationNumber(href: string | undefined): number | null {
  if (!href?.startsWith(PREFIX)) return null;
  const n = Number(href.slice(PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** react-markdown strips unknown protocols; allow our `cite:` links and keep the default rules. */
export function allowCitationUrls(url: string): string {
  if (url.startsWith(PREFIX)) return url;
  return /^(https?:|mailto:|#|\/)/i.test(url) ? url : "";
}
