import { createHash } from "node:crypto";

export const SNIPPET_MAX = 500;

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref|ocid|cmpid)$/i;

/** Canonical form of a URL for dedupe: lowercase host, no www, no tracking params, no fragment, no trailing slash. */
export function canonicalUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.protocol = "https:";
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  const path = u.pathname.replace(/\/+$/, "");
  const query = u.searchParams.toString();
  return `${u.protocol}//${u.host}${path}${query ? `?${query}` : ""}`;
}

/**
 * Google News titles look like "Headline text - Publisher". Strip the trailing
 * publisher so the same story from a direct feed hashes identically.
 */
export function stripPublisherSuffix(title: string, publisher?: string | null): string {
  const t = title.trim();
  if (publisher) {
    const suffix = ` - ${publisher}`;
    if (t.endsWith(suffix)) return t.slice(0, -suffix.length).trim();
  }
  return t.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, "").trim() || t;
}

/** Lowercase, NFKC, punctuation removed, whitespace collapsed. Keeps Kannada letters + combining marks. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’'`"“”]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function titleHash(title: string): string {
  return sha256(normalizeTitle(title));
}

export function urlHash(url: string): string {
  return sha256(canonicalUrl(url));
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

/** Plain-text snippet, HTML stripped, capped at SNIPPET_MAX chars. We never store full article text. */
export function toSnippet(input: string | undefined | null, max = SNIPPET_MAX): string | null {
  if (!input) return null;
  const text = input
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
