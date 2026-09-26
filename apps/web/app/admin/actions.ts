"use server";

import { revalidatePath } from "next/cache";
import { adminDb } from "@/lib/admin-db";
import { slugify } from "@/lib/format";

const INTENTS = ["save", "approve", "reject", "publish"] as const;
type Intent = (typeof INTENTS)[number];

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Saves inline edits, then applies the button's intent. Middleware guards /admin, so this only runs for the editor. */
export async function updateStory(formData: FormData) {
  const id = String(formData.get("id"));
  const intent = String(formData.get("intent")) as Intent;
  if (!INTENTS.includes(intent)) throw new Error(`Unknown intent ${intent}`);

  const patch: Record<string, unknown> = {
    headline: String(formData.get("headline") ?? "").trim(),
    summary_md: String(formData.get("summary_md") ?? "").trim(),
    why_it_matters: String(formData.get("why_it_matters") ?? "").trim() || null,
    category: String(formData.get("category")),
    key_facts: lines(formData.get("key_facts")),
    source_urls: lines(formData.get("source_urls")),
  };

  if (intent === "approve") patch.status = "approved";
  if (intent === "reject") patch.status = "rejected";
  if (intent === "publish") {
    const { data: current, error } = await adminDb().from("stories").select("slug").eq("id", id).single();
    if (error) throw error;
    patch.status = "published";
    patch.slug = current.slug ?? `${slugify(String(patch.headline))}-${id.slice(0, 6)}`;
    patch.published_at = new Date().toISOString();
  }

  const { error } = await adminDb().from("stories").update(patch).eq("id", id);
  if (error) throw error;

  revalidatePath("/admin");
  if (intent === "publish") {
    revalidatePath("/");
    revalidatePath("/news");
    revalidatePath(`/news/${patch.slug}`);
    revalidatePath("/news/feed.xml");
    revalidatePath("/sitemap.xml");
  }
}
