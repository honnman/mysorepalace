import Parser from "rss-parser";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PKG_ROOT } from "./lib/env.js";
import { db } from "./lib/db.js";
import { logger } from "./lib/log.js";
import { stripPublisherSuffix, titleHash, toSnippet, urlHash } from "./lib/text.js";
import type { Source } from "./lib/types.js";

const log = logger("ingest");

/** A feed entry as returned by a fetcher, before normalisation. */
export interface FeedEntry {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  content?: string;
  /** Google News: originating outlet */
  source?: string;
}

export type FeedFetcher = (source: Source) => Promise<FeedEntry[]>;

export interface Candidate {
  source_id: string;
  external_id: string;
  title: string;
  url: string;
  published_at: string | null;
  snippet: string | null;
  hash: string;
  publisher: string | null;
}

const parser = new Parser<Record<string, unknown>, { source?: string | { _: string } }>({
  timeout: 20_000,
  headers: { "User-Agent": "mysuru-heritage-desk/0.1 (+https://mysorepalace.com)" },
  customFields: { item: ["source"] },
});

export const rssFetcher: FeedFetcher = async (source) => {
  const feed = await parser.parseURL(source.url);
  return feed.items.map((it) => ({
    title: it.title,
    link: it.link,
    pubDate: it.pubDate,
    isoDate: it.isoDate,
    contentSnippet: it.contentSnippet,
    content: it.content,
    source: typeof it.source === "string" ? it.source : it.source?._,
  }));
};

/** Reads fixtures/feeds.json ({ [sourceName]: FeedEntry[] }) — no network. */
export function fixtureFetcher(file = path.join(PKG_ROOT, "fixtures", "feeds.json")): FeedFetcher {
  const byName: Record<string, FeedEntry[]> = JSON.parse(readFileSync(file, "utf8"));
  return async (source) => byName[source.name] ?? [];
}

export function toCandidate(source: Source, entry: FeedEntry): Candidate | null {
  if (!entry.title || !entry.link) return null;
  const publisher = entry.source?.trim() || (source.type === "gnews" ? null : source.name);
  const title = source.type === "gnews" ? stripPublisherSuffix(entry.title, entry.source) : entry.title.trim();
  const date = entry.isoDate ?? entry.pubDate;
  const parsed = date ? new Date(date) : null;
  return {
    source_id: source.id,
    external_id: urlHash(entry.link),
    title,
    url: entry.link.trim(),
    published_at: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    snippet: toSnippet(entry.contentSnippet ?? entry.content),
    hash: titleHash(title),
    publisher,
  };
}

/**
 * Drop candidates whose URL hash or title hash is already known (from the DB
 * or earlier in this batch). First occurrence wins.
 */
export function dedupe(candidates: Candidate[], seenExternalIds: Iterable<string>, seenHashes: Iterable<string>): Candidate[] {
  const ids = new Set(seenExternalIds);
  const hashes = new Set(seenHashes);
  const out: Candidate[] = [];
  for (const c of candidates) {
    if (ids.has(c.external_id) || hashes.has(c.hash)) continue;
    ids.add(c.external_id);
    hashes.add(c.hash);
    out.push(c);
  }
  return out;
}

async function existingKeys(candidates: Candidate[]) {
  const ids = new Set<string>();
  const hashes = new Set<string>();
  const chunk = 100;
  for (let i = 0; i < candidates.length; i += chunk) {
    const slice = candidates.slice(i, i + chunk);
    const [byId, byHash] = await Promise.all([
      db().from("raw_items").select("external_id").in("external_id", slice.map((c) => c.external_id)),
      db().from("raw_items").select("hash").in("hash", slice.map((c) => c.hash)),
    ]);
    if (byId.error) throw byId.error;
    if (byHash.error) throw byHash.error;
    byId.data.forEach((r) => ids.add(r.external_id));
    byHash.data.forEach((r) => hashes.add(r.hash));
  }
  return { ids, hashes };
}

export async function ingest(fetcher: FeedFetcher = rssFetcher) {
  const { data: sources, error } = await db().from("sources").select("*").eq("active", true);
  if (error) throw error;

  const candidates: Candidate[] = [];
  let failed = 0;
  for (const source of sources as Source[]) {
    if (source.type === "manual") continue;
    try {
      const entries = await fetcher(source);
      const mapped = entries.map((e) => toCandidate(source, e)).filter((c): c is Candidate => c !== null);
      candidates.push(...mapped);
      log.info(`fetched ${source.name}`, { entries: entries.length });
    } catch (e) {
      failed++;
      log.warn(`fetch failed for ${source.name}`, { error: String(e) });
    }
  }

  const known = await existingKeys(candidates);
  const fresh = dedupe(candidates, known.ids, known.hashes);

  if (fresh.length) {
    const { error: insErr } = await db()
      .from("raw_items")
      .upsert(fresh, { onConflict: "external_id", ignoreDuplicates: true });
    if (insErr) throw insErr;
  }
  const stats = { sources: sources.length, failed, fetched: candidates.length, inserted: fresh.length };
  log.info("done", stats);
  return stats;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const fetcher = process.argv.includes("--fixtures") ? fixtureFetcher() : rssFetcher;
  ingest(fetcher).catch((e) => {
    log.error(String(e));
    process.exit(1);
  });
}
