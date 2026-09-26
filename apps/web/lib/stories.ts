import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type StoryStatus = "pending" | "approved" | "rejected" | "published";

export interface Story {
  id: string;
  cluster_key: string;
  category: string;
  headline: string;
  summary_md: string;
  why_it_matters: string | null;
  key_facts: string[];
  source_urls: string[];
  status: StoryStatus;
  created_at: string;
  published_at: string | null;
  slug: string | null;
  review_notes: string | null;
}

const PUBLIC_FIELDS =
  "id, category, headline, summary_md, why_it_matters, key_facts, source_urls, created_at, published_at, slug";

export type PublicStory = Pick<
  Story,
  "id" | "category" | "headline" | "summary_md" | "why_it_matters" | "key_facts" | "source_urls" | "created_at" | "published_at" | "slug"
>;

let anon: SupabaseClient | null | undefined;

/** Anon client — RLS limits it to published stories. Null when env is not configured (e.g. CI build). */
function publicClient(): SupabaseClient | null {
  if (anon !== undefined) return anon;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  anon = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  if (!anon) console.warn("Supabase env not set; news pages will be empty.");
  return anon;
}

export async function listPublished(limit = 50): Promise<PublicStory[]> {
  const sb = publicClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("stories")
    .select(PUBLIC_FIELDS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as PublicStory[];
}

export async function getPublished(slug: string): Promise<PublicStory | null> {
  const sb = publicClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("stories")
    .select(PUBLIC_FIELDS)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as PublicStory | null;
}
