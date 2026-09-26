import { z } from "zod";
import { pathToFileURL } from "node:url";
import { db } from "./lib/db.js";
import { callStructured, loadPrompt, type ClaudeClient } from "./lib/claude.js";
import { logger } from "./lib/log.js";
import { CATEGORIES, RELEVANCE_THRESHOLD, type Category } from "./lib/types.js";

const log = logger("classify");

export const BATCH_SIZE = 20;
const MAX_PER_RUN = 400;

export interface ClassifyInput {
  id: string;
  title: string;
  snippet: string | null;
  publisher: string | null;
  language: string;
}

export const ClassificationSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      category: z.enum(CATEGORIES),
      relevance: z.number(),
      reason: z.string(),
    }),
  ),
});

export interface Classification {
  id: string;
  category: Category;
  relevance: number;
  reason: string;
  keep: boolean;
}

export function buildClassifyUserMessage(items: ClassifyInput[]): string {
  const payload = items.map((it) => ({
    id: it.id,
    title: it.title,
    snippet: it.snippet ?? "",
    outlet: it.publisher ?? "unknown",
    language: it.language,
  }));
  return `Classify these ${items.length} news items.\n\n<items>\n${JSON.stringify(payload, null, 2)}\n</items>`;
}

/**
 * Normalise the model output: drop ids we didn't send, clamp relevance, and
 * flag which items pass the relevance threshold. Items the model skipped are
 * returned in `missing` so they are retried next run.
 */
export function interpretResults(
  items: ClassifyInput[],
  output: z.infer<typeof ClassificationSchema>,
): { classified: Classification[]; missing: string[] } {
  const sent = new Set(items.map((i) => i.id));
  const seen = new Map<string, Classification>();
  for (const r of output.results) {
    if (!sent.has(r.id) || seen.has(r.id)) continue;
    const relevance = Math.min(1, Math.max(0, r.relevance));
    const keep = r.category !== "reject" && relevance >= RELEVANCE_THRESHOLD;
    seen.set(r.id, { id: r.id, category: r.category, relevance, reason: r.reason.slice(0, 500), keep });
  }
  return {
    classified: [...seen.values()],
    missing: items.filter((i) => !seen.has(i.id)).map((i) => i.id),
  };
}

export async function classifyBatch(items: ClassifyInput[], client?: ClaudeClient, modelName?: string) {
  const output = await callStructured({
    client,
    model: modelName,
    system: loadPrompt("classify"),
    user: buildClassifyUserMessage(items),
    schema: ClassificationSchema,
    maxTokens: 8000,
  });
  return interpretResults(items, output);
}

export async function classify() {
  const { data, error } = await db()
    .from("raw_items")
    .select("id, title, snippet, publisher, sources(language)")
    .is("classified_at", null)
    .order("fetched_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw error;

  const items: ClassifyInput[] = (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    publisher: r.publisher,
    language: r.sources?.language ?? "en",
  }));

  let kept = 0;
  let discarded = 0;
  let failedBatches = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const { classified, missing } = await classifyBatch(batch);
      const now = new Date().toISOString();
      for (const c of classified) {
        const { error: upErr } = await db()
          .from("raw_items")
          .update({ category: c.category, relevance: c.relevance, reason: c.reason, classified_at: now })
          .eq("id", c.id);
        if (upErr) throw upErr;
        c.keep ? kept++ : discarded++;
      }
      if (missing.length) log.warn("model skipped items; will retry next run", { count: missing.length });
    } catch (e) {
      failedBatches++;
      log.warn(`batch ${i / BATCH_SIZE + 1} failed; items stay unclassified`, { error: String(e) });
    }
  }
  const stats = { pending: items.length, kept, discarded, failedBatches };
  log.info("done", stats);
  return stats;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  classify().catch((e) => {
    log.error(String(e));
    process.exit(1);
  });
}
