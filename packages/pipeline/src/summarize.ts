import { z } from "zod";
import { pathToFileURL } from "node:url";
import { db } from "./lib/db.js";
import { callStructured, loadPrompt, type ClaudeClient } from "./lib/claude.js";
import { logger } from "./lib/log.js";
import { normalizeTitle, wordCount } from "./lib/text.js";
import type { Category } from "./lib/types.js";

const log = logger("summarize");

const COPY_NGRAM = 8;
const MAX_QUOTE_WORDS = 12;

export interface ClusterItem {
  id: string;
  title: string;
  snippet: string | null;
  url: string;
  publisher: string | null;
  source_name: string;
  language: string;
  published_at: string | null;
  category: Category;
}

export const SummarySchema = z.object({
  headline: z.string(),
  summary_md: z.string(),
  why_it_matters: z.string(),
  key_facts: z.array(z.string()),
  sources: z.array(z.object({ outlet: z.string(), url: z.string() })),
  uncertainty: z.string(),
});
export type Summary = z.infer<typeof SummarySchema>;

export function buildSummarizeUserMessage(items: ClusterItem[]): string {
  const payload = items.map((it) => ({
    outlet: it.publisher ?? it.source_name,
    url: it.url,
    language: it.language,
    published_at: it.published_at,
    headline: it.title,
    snippet: it.snippet ?? "",
  }));
  return `Write a brief for this story cluster (${items.length} source item${items.length === 1 ? "" : "s"}).\n\n<items>\n${JSON.stringify(payload, null, 2)}\n</items>`;
}

function ngrams(text: string, n: number): Set<string> {
  const words = normalizeTitle(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

/** Mechanical checks for the prompt's hard rules. Returns a list of problems (empty = OK). */
export function checkSummary(summary: Summary, items: ClusterItem[]): string[] {
  const problems: string[] = [];
  const words = wordCount(summary.summary_md);
  if (words < 150 || words > 250) problems.push(`summary is ${words} words; must be 150–250`);
  if (summary.key_facts.length < 3 || summary.key_facts.length > 5)
    problems.push(`key_facts has ${summary.key_facts.length} entries; must be 3–5`);

  const sourceGrams = new Set<string>();
  for (const it of items) for (const g of ngrams(`${it.title} . ${it.snippet ?? ""}`, COPY_NGRAM)) sourceGrams.add(g);
  const written = [summary.headline, summary.summary_md, summary.why_it_matters, ...summary.key_facts].join(" . ");
  const copied = [...ngrams(written, COPY_NGRAM)].filter((g) => sourceGrams.has(g));
  if (copied.length) problems.push(`copies source wording: "${copied[0]}"`);

  for (const m of written.matchAll(/[“"]([^”"]+)[”"]/g)) {
    if (wordCount(m[1]!) > MAX_QUOTE_WORDS) problems.push(`quote over ${MAX_QUOTE_WORDS} words: "${m[1]}"`);
  }
  return problems;
}

export function majorityCategory(items: ClusterItem[]): Category {
  const counts = new Map<Category, number>();
  for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

export async function summarizeCluster(items: ClusterItem[], client?: ClaudeClient) {
  const system = loadPrompt("summarize");
  let user = buildSummarizeUserMessage(items);
  let summary = await callStructured({ client, system, user, schema: SummarySchema });
  let problems = checkSummary(summary, items);
  if (problems.length) {
    // One retry with explicit feedback.
    user += `\n\nA previous draft broke these rules — fix them:\n${problems.map((p) => `- ${p}`).join("\n")}`;
    summary = await callStructured({ client, system, user, schema: SummarySchema });
    problems = checkSummary(summary, items);
  }
  return { summary, problems };
}

function toStoryRow(clusterKey: string, items: ClusterItem[], summary: Summary, problems: string[]) {
  // Source list comes from our own records, not the model, so every item is credited.
  const sourceUrls = [...new Set(items.map((i) => i.url))];
  const notes = [
    summary.uncertainty && `Sources conflict: ${summary.uncertainty}`,
    ...problems.map((p) => `Rule check: ${p}`),
  ].filter(Boolean);
  return {
    cluster_key: clusterKey,
    category: majorityCategory(items),
    headline: summary.headline.trim(),
    summary_md: summary.summary_md.trim(),
    why_it_matters: summary.why_it_matters.trim(),
    key_facts: summary.key_facts,
    source_urls: sourceUrls,
    review_notes: notes.length ? notes.join("\n") : null,
  };
}

const LOOKBACK_DAYS = 14;

export async function summarize() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data, error } = await db()
    .from("raw_items")
    .select("id, title, snippet, url, publisher, published_at, category, cluster_key, sources(name, language)")
    .not("cluster_key", "is", null)
    .gte("fetched_at", since);
  if (error) throw error;

  const clusters = new Map<string, ClusterItem[]>();
  for (const r of data as any[]) {
    const item: ClusterItem = {
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      url: r.url,
      publisher: r.publisher,
      source_name: r.sources?.name ?? "unknown",
      language: r.sources?.language ?? "en",
      published_at: r.published_at,
      category: r.category,
    };
    clusters.set(r.cluster_key, [...(clusters.get(r.cluster_key) ?? []), item]);
  }

  const { data: stories, error: sErr } = await db()
    .from("stories")
    .select("cluster_key, status, source_urls")
    .in("cluster_key", [...clusters.keys()]);
  if (sErr) throw sErr;
  const existing = new Map(stories.map((s) => [s.cluster_key as string, s]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  for (const [key, items] of clusters) {
    const story = existing.get(key);
    const urls = new Set(items.map((i) => i.url));
    // Idempotency: skip clusters that already have a story, unless it is still
    // pending and new sources have joined since it was written.
    if (story && (story.status !== "pending" || (story.source_urls as string[]).length >= urls.size)) {
      skipped++;
      continue;
    }
    try {
      const { summary, problems } = await summarizeCluster(items);
      if (problems.length) log.warn(`cluster ${key} saved with review flags`, { problems });
      const row = toStoryRow(key, items, summary, problems);
      const { error: upErr } = await db().from("stories").upsert(row, { onConflict: "cluster_key" });
      if (upErr) throw upErr;
      story ? updated++ : created++;
    } catch (e) {
      failed++;
      log.warn(`cluster ${key} failed`, { error: String(e) });
    }
  }
  const stats = { clusters: clusters.size, created, updated, skipped, failed };
  log.info("done", stats);
  return stats;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  summarize().catch((e) => {
    log.error(String(e));
    process.exit(1);
  });
}
