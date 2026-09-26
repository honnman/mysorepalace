import { pathToFileURL } from "node:url";
import { db } from "./lib/db.js";
import { logger } from "./lib/log.js";
import { normalizeTitle, sha256 } from "./lib/text.js";
import { RELEVANCE_THRESHOLD } from "./lib/types.js";

const log = logger("cluster");

export const WINDOW_HOURS = 48;
export const SIMILARITY_THRESHOLD = 0.35;

export interface ClusterInput {
  id: string;
  title: string;
  published_at: string | null;
  fetched_at: string;
  cluster_key: string | null;
}

const STOPWORDS = new Set(
  (
    "a an the and or but of to in on at for from by with as is are was were be been being this that these those " +
    "it its into over after before about amid says said say will would can could may might new news today " +
    "his her their them he she they we you i our not no than then also up out more most all any some"
  ).split(" "),
);

// Spelling variants that should compare equal.
const SYNONYMS: Record<string, string> = {
  mysore: "mysuru",
  wodeyar: "wadiyar",
  wodeyars: "wadiyar",
  wadiyars: "wadiyar",
  wodiyar: "wadiyar",
  dussehra: "dasara",
  dasera: "dasara",
  dussera: "dasara",
  jambu: "jamboo",
  elephants: "elephant",
};

export function titleTokens(title: string): Set<string> {
  const tokens = normalizeTitle(title)
    .split(" ")
    .map((t) => SYNONYMS[t] ?? t)
    .map((t) => (t.length > 4 && t.endsWith("s") && /^[a-z]+$/.test(t) ? t.slice(0, -1) : t))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function timeOf(item: ClusterInput): number {
  return new Date(item.published_at ?? item.fetched_at).getTime();
}

export function clusterKeyFor(seedId: string): string {
  return `c_${sha256(seedId).slice(0, 16)}`;
}

/**
 * Group items describing the same story: title Jaccard similarity above the
 * threshold AND published within WINDOW_HOURS of each other (single-link).
 * Items that already carry a cluster_key keep it, and new items that join
 * them inherit it, so re-runs are stable.
 */
export function clusterItems(
  items: ClusterInput[],
  opts: { windowHours?: number; threshold?: number } = {},
): Map<string, string> {
  const windowMs = (opts.windowHours ?? WINDOW_HOURS) * 3600_000;
  const threshold = opts.threshold ?? SIMILARITY_THRESHOLD;

  const sorted = [...items].sort((a, b) => timeOf(a) - timeOf(b) || a.id.localeCompare(b.id));
  const tokens = sorted.map((i) => titleTokens(i.title));
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (timeOf(sorted[j]!) - timeOf(sorted[i]!) > windowMs) break;
      // Two existing, different clusters are never merged — their stories may already exist.
      const ki = sorted[i]!.cluster_key;
      const kj = sorted[j]!.cluster_key;
      if (ki && kj && ki !== kj) continue;
      if (jaccard(tokens[i]!, tokens[j]!) >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  sorted.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });

  const result = new Map<string, string>();
  for (const members of groups.values()) {
    const existing = members.map((m) => sorted[m]!.cluster_key).find(Boolean);
    const key = existing ?? clusterKeyFor(sorted[members[0]!]!.id);
    for (const m of members) result.set(sorted[m]!.id, key);
  }
  return result;
}

export async function cluster() {
  // Unclustered relevant items, plus recently clustered ones they might join.
  const since = new Date(Date.now() - 2 * WINDOW_HOURS * 3600_000).toISOString();
  const base = () =>
    db()
      .from("raw_items")
      .select("id, title, published_at, fetched_at, cluster_key")
      .not("classified_at", "is", null)
      .neq("category", "reject")
      .gte("relevance", RELEVANCE_THRESHOLD);

  const [fresh, recent] = await Promise.all([
    base().is("cluster_key", null),
    base().not("cluster_key", "is", null).gte("fetched_at", since),
  ]);
  if (fresh.error) throw fresh.error;
  if (recent.error) throw recent.error;

  if (!fresh.data.length) {
    log.info("nothing to cluster");
    return { assigned: 0, clusters: 0 };
  }

  const assignments = clusterItems([...fresh.data, ...recent.data] as ClusterInput[]);
  const freshIds = new Set(fresh.data.map((r) => r.id));
  const byKey = new Map<string, string[]>();
  for (const [id, key] of assignments) {
    if (freshIds.has(id)) byKey.set(key, [...(byKey.get(key) ?? []), id]);
  }
  for (const [key, ids] of byKey) {
    const { error } = await db().from("raw_items").update({ cluster_key: key }).in("id", ids);
    if (error) throw error;
  }
  const stats = { assigned: freshIds.size, clusters: byKey.size };
  log.info("done", stats);
  return stats;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  cluster().catch((e) => {
    log.error(String(e));
    process.exit(1);
  });
}
