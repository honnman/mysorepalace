import { pathToFileURL } from "node:url";
import { db } from "./lib/db.js";
import { logger } from "./lib/log.js";
import type { Category } from "./lib/types.js";

const log = logger("digest");

const SECTION_TITLES: Record<Exclude<Category, "reject">, string> = {
  palace: "At the Palace",
  dasara: "Dasara",
  royal_family: "Royal Family — Public Events",
  heritage: "Heritage",
  city: "Around Mysuru",
};

export interface DigestStory {
  headline: string;
  why_it_matters: string | null;
  category: Category;
  slug: string | null;
  source_urls: string[];
}

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

export function renderDigest(week: string, stories: DigestStory[], siteUrl: string): string {
  const lines = [`# Mysuru Heritage Desk — week of ${week}`, ""];
  if (!stories.length) return [...lines, "_No approved stories this week._", ""].join("\n");
  for (const [cat, title] of Object.entries(SECTION_TITLES)) {
    const inCat = stories.filter((s) => s.category === cat);
    if (!inCat.length) continue;
    lines.push(`## ${title}`, "");
    for (const s of inCat) {
      const link = s.slug ? `${siteUrl}/news/${s.slug}` : s.source_urls[0];
      lines.push(`- **[${s.headline}](${link})**${s.why_it_matters ? ` — ${s.why_it_matters}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Compile last week's approved/published stories into a draft digest (re-running overwrites a draft). */
export async function digest(now = new Date()) {
  const lastWeek = new Date(now.getTime() - 7 * 86400_000);
  const week = weekStart(lastWeek);
  const end = new Date(new Date(week).getTime() + 7 * 86400_000).toISOString();

  const { data, error } = await db()
    .from("stories")
    .select("headline, why_it_matters, category, slug, source_urls")
    .in("status", ["approved", "published"])
    .gte("created_at", week)
    .lt("created_at", end)
    .order("created_at");
  if (error) throw error;

  const { data: current } = await db().from("digests").select("status").eq("week_start", week).maybeSingle();
  if (current && current.status !== "draft") {
    log.info(`digest for ${week} already ${current.status}; leaving it`);
    return { week, stories: data.length, written: false };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mysorepalace.com";
  const body_md = renderDigest(week, data as DigestStory[], siteUrl);
  const { error: upErr } = await db()
    .from("digests")
    .upsert({ week_start: week, body_md, status: "draft" }, { onConflict: "week_start" });
  if (upErr) throw upErr;
  log.info("done", { week, stories: data.length });
  return { week, stories: data.length, written: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  digest().catch((e) => {
    log.error(String(e));
    process.exit(1);
  });
}
