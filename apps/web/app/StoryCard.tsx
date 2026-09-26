import Link from "next/link";
import type { PublicStory } from "@/lib/stories";
import { CATEGORY_LABELS } from "@/lib/site";
import { formatDate } from "@/lib/format";

export function StoryCard({ story }: { story: PublicStory }) {
  return (
    <article className="border-b border-gold/20 py-4">
      <p className="text-xs uppercase tracking-wide text-maroon">
        {CATEGORY_LABELS[story.category] ?? story.category} · {formatDate(story.published_at)}
      </p>
      <h3 className="mt-1 text-lg font-semibold">
        <Link href={`/news/${story.slug}`} className="hover:underline">
          {story.headline}
        </Link>
      </h3>
      {story.why_it_matters && <p className="mt-1 text-ink/80">{story.why_it_matters}</p>}
    </article>
  );
}
