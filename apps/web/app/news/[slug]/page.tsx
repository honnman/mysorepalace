import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublished } from "@/lib/stories";
import { CATEGORY_LABELS, SITE_NAME, SITE_URL } from "@/lib/site";
import { formatDate, hostname, paragraphs } from "@/lib/format";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const story = await getPublished((await params).slug);
  if (!story) return {};
  return {
    title: story.headline,
    description: story.why_it_matters ?? undefined,
    alternates: { canonical: `/news/${story.slug}` },
    openGraph: { type: "article", title: story.headline, publishedTime: story.published_at ?? undefined },
  };
}

export default async function StoryPage({ params }: { params: Params }) {
  const story = await getPublished((await params).slug);
  if (!story) notFound();

  const url = `${SITE_URL}/news/${story.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: story.headline,
    description: story.why_it_matters ?? undefined,
    datePublished: story.published_at,
    dateModified: story.published_at,
    articleSection: CATEGORY_LABELS[story.category] ?? story.category,
    mainEntityOfPage: url,
    url,
    isBasedOn: story.source_urls,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <p className="text-xs uppercase tracking-wide text-maroon">
        {CATEGORY_LABELS[story.category] ?? story.category} · {formatDate(story.published_at)}
      </p>
      <h1 className="mt-2 text-3xl font-bold leading-tight">{story.headline}</h1>

      <div className="mt-6 space-y-4 text-lg leading-relaxed">
        {paragraphs(story.summary_md).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {story.why_it_matters && (
        <aside className="mt-8 border-l-4 border-gold bg-white/60 p-4">
          <h2 className="font-semibold">Why it matters</h2>
          <p className="mt-1">{story.why_it_matters}</p>
        </aside>
      )}

      {story.key_facts?.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold">Key facts</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {story.key_facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 border-t border-gold/30 pt-4 text-sm">
        <h2 className="font-semibold">Sources</h2>
        <p className="mt-1 text-ink/70">This is an original summary. Read the full reporting at:</p>
        <ul className="mt-2 space-y-1">
          {story.source_urls.map((u) => (
            <li key={u}>
              <a href={u} rel="noopener nofollow" target="_blank" className="underline">
                {hostname(u)}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}
