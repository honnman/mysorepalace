import Link from "next/link";
import type { PublicStory } from "@/lib/stories";
import { CATEGORY_LABELS } from "@/lib/site";
import { formatDate } from "@/lib/format";

export function StoryCard({ story }: { story: PublicStory }) {
  return (
    <article className="border-b border-gold/40 py-5">
      <p className="text-xs uppercase tracking-widest text-gold-dark">
        {CATEGORY_LABELS[story.category] ?? story.category} · {formatDate(story.published_at)}
      </p>
      <h3 className="mt-1 font-display text-2xl font-bold leading-snug text-silk">
        <Link href={`/news/${story.slug}`} className="hover:underline">
          {story.headline}
        </Link>
      </h3>
      {story.why_it_matters && <p className="mt-1 text-ink/80">{story.why_it_matters}</p>}
    </article>
  );
}
