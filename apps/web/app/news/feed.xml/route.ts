import { listPublished } from "@/lib/stories";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { escapeXml } from "@/lib/format";

export const revalidate = 600;

export async function GET() {
  const stories = await listPublished(50);
  const items = stories
    .map((s) => {
      const link = `${SITE_URL}/news/${s.slug}`;
      return `    <item>
      <title>${escapeXml(s.headline)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(s.published_at ?? s.created_at).toUTCString()}</pubDate>
      <category>${escapeXml(s.category)}</category>
      <description>${escapeXml(s.why_it_matters ?? "")}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} — News</title>
    <link>${SITE_URL}/news</link>
    <atom:link href="${SITE_URL}/news/feed.xml" rel="self" type="application/rss+xml" />
    <description>Reviewed news briefs on Mysore Palace, Dasara and Mysuru heritage.</description>
    <language>en-in</language>
${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
