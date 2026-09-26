import type { Metadata } from "next";
import { listPublished } from "@/lib/stories";
import { StoryCard } from "../StoryCard";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "News",
  description: "Reviewed news briefs on Mysore Palace, Mysuru Dasara, the Wadiyar family's public events and Mysuru heritage.",
  alternates: { canonical: "/news" },
};

export default async function NewsIndex() {
  const stories = await listPublished(100);
  return (
    <>
      <h1 className="mango font-display text-5xl font-bold text-silk">News</h1>
      <p className="mt-2 text-ink/70">
        Original summaries of Mysuru heritage news, each reviewed by an editor and linked to its sources.
      </p>
      <div className="mt-6">
        {stories.length ? stories.map((s) => <StoryCard key={s.id} story={s} />) : <p className="text-ink/60">No stories published yet.</p>}
      </div>
    </>
  );
}
