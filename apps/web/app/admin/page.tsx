import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/admin-db";
import type { Story, StoryStatus } from "@/lib/stories";
import { CATEGORY_LABELS } from "@/lib/site";
import { formatDate, hostname } from "@/lib/format";
import { updateStory } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review queue", robots: { index: false, follow: false } };

const TABS: StoryStatus[] = ["pending", "approved", "rejected", "published"];
const input = "w-full rounded border border-ink/20 bg-white p-2 font-sans text-sm";

export default async function Admin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const requested = (await searchParams).status as StoryStatus | undefined;
  const status: StoryStatus = requested && TABS.includes(requested) ? requested : "pending";

  const { data, error } = await adminDb()
    .from("stories")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const stories = data as Story[];

  return (
    <div className="font-sans">
      <h1 className="text-2xl font-bold">Review queue</h1>
      <nav className="mt-4 flex gap-4 text-sm">
        {TABS.map((t) => (
          <Link key={t} href={`/admin?status=${t}`} className={t === status ? "font-bold underline" : "text-ink/60"}>
            {t}
          </Link>
        ))}
      </nav>

      {!stories.length && <p className="mt-8 text-ink/60">Nothing {status}.</p>}

      {stories.map((s) => (
        <form key={s.id} action={updateStory} className="mt-8 space-y-3 rounded-lg border border-gold/30 bg-white/70 p-4">
          <input type="hidden" name="id" value={s.id} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink/60">
            <span>Created {formatDate(s.created_at)}</span>
            {s.slug && <Link href={`/news/${s.slug}`} className="underline">/news/{s.slug}</Link>}
            <select name="category" defaultValue={s.category} className="rounded border border-ink/20 bg-white p-1">
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {s.review_notes && (
            <p className="whitespace-pre-line rounded bg-amber-100 p-2 text-sm text-amber-900">{s.review_notes}</p>
          )}

          <label className="block text-sm font-semibold">
            Headline
            <input name="headline" defaultValue={s.headline} className={input} required />
          </label>
          <label className="block text-sm font-semibold">
            Summary (markdown)
            <textarea name="summary_md" defaultValue={s.summary_md} rows={8} className={input} required />
          </label>
          <label className="block text-sm font-semibold">
            Why it matters
            <textarea name="why_it_matters" defaultValue={s.why_it_matters ?? ""} rows={2} className={input} />
          </label>
          <label className="block text-sm font-semibold">
            Key facts (one per line)
            <textarea name="key_facts" defaultValue={(s.key_facts ?? []).join("\n")} rows={4} className={input} />
          </label>
          <label className="block text-sm font-semibold">
            Source URLs (one per line)
            <textarea name="source_urls" defaultValue={s.source_urls.join("\n")} rows={3} className={input} />
          </label>
          <p className="text-xs text-ink/60">
            Sources:{" "}
            {s.source_urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener" className="mr-2 underline">{hostname(u)}</a>
            ))}
          </p>

          <div className="flex flex-wrap gap-2">
            <button name="intent" value="save" className="rounded border px-3 py-1">Save</button>
            <button name="intent" value="approve" className="rounded bg-emerald-700 px-3 py-1 text-white">Approve</button>
            <button name="intent" value="reject" className="rounded bg-red-700 px-3 py-1 text-white">Reject</button>
            <button name="intent" value="publish" className="rounded bg-maroon px-3 py-1 text-white">Publish</button>
          </div>
        </form>
      ))}
    </div>
  );
}
